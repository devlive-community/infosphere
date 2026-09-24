package storage

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strings"
	"time"
)

// S3 兼容对象存储（AWS S3、阿里云 OSS、腾讯云 COS、MinIO、Cloudflare R2 等）：以 AWS Signature V4 签名 PutObject。
//   - Endpoint：服务地址，如 https://s3.us-east-1.amazonaws.com、https://oss-cn-hangzhou.aliyuncs.com、
//     https://cos.ap-guangzhou.myqcloud.com、https://<account>.r2.cloudflarestorage.com、http://minio:9000；
//   - PathStyle：路径风格（endpoint/bucket/key，MinIO 等需要）；否则虚拟主机风格（bucket.endpoint/key）；
//   - PublicURL：对外访问地址（CDN 或存储桶公开域名），留空时返回对象的 endpoint 地址；
//   - Prefix：对象键前缀（如 knowforge/）。

var s3Client = &http.Client{Timeout: 60 * time.Second}

type S3Uploader struct {
	cfg Config
	now func() time.Time
}

func (u *S3Uploader) Upload(name string, data []byte) (string, error) {
	key := strings.TrimLeft(strings.Trim(u.cfg.S3Prefix, "/")+"/"+name, "/")
	objectURL, err := s3ObjectURL(u.cfg, key)
	if err != nil {
		return "", err
	}
	contentType := mime.TypeByExtension(strings.ToLower(path.Ext(name)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	now := time.Now
	if u.now != nil {
		now = u.now
	}
	req, err := http.NewRequest(http.MethodPut, objectURL.String(), bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("构造上传请求失败: %w", err)
	}
	req.Header.Set("Content-Type", contentType)
	signS3Request(req, data, u.cfg, now().UTC())
	resp, err := s3Client.Do(req)
	if err != nil {
		return "", fmt.Errorf("上传到对象存储失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", fmt.Errorf("上传到对象存储失败 (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if base := strings.TrimRight(u.cfg.S3PublicURL, "/"); base != "" {
		return base + "/" + s3EscapePath(key), nil
	}
	return objectURL.String(), nil
}

// s3ObjectURL 对象地址：路径风格 endpoint/bucket/key，虚拟主机风格 bucket.host/key。
func s3ObjectURL(cfg Config, key string) (*url.URL, error) {
	endpoint, err := url.Parse(strings.TrimRight(cfg.S3Endpoint, "/"))
	if err != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Host == "" {
		return nil, fmt.Errorf("对象存储服务地址无效")
	}
	u := &url.URL{Scheme: endpoint.Scheme, Host: endpoint.Host}
	if cfg.S3PathStyle {
		u.Path = "/" + cfg.S3Bucket + "/" + key
	} else {
		u.Host = cfg.S3Bucket + "." + endpoint.Host
		u.Path = "/" + key
	}
	u.RawPath = s3EscapePath(u.Path)
	return u, nil
}

// s3EscapePath 按 SigV4 规则逐段 URI 编码（保留 /）。
func s3EscapePath(p string) string {
	segments := strings.Split(p, "/")
	for i, s := range segments {
		segments[i] = s3Escape(s)
	}
	return strings.Join(segments, "/")
}

func s3Escape(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return mac.Sum(nil)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// sigV4 计算 AWS Signature Version 4：返回 Credential（AK/scope）、SignedHeaders 与签名（headers 键为小写头名）。
func sigV4(method, escapedPath, rawQuery string, headers map[string]string, payloadHash, accessKey, secretKey, region string, now time.Time) (string, string, string) {
	amzDate := now.Format("20060102T150405Z")
	date := now.Format("20060102")
	names := make([]string, 0, len(headers))
	for k := range headers {
		names = append(names, k)
	}
	sort.Strings(names)
	var canonicalHeaders strings.Builder
	for _, k := range names {
		canonicalHeaders.WriteString(k + ":" + strings.TrimSpace(headers[k]) + "\n")
	}
	signedHeaders := strings.Join(names, ";")
	canonicalRequest := strings.Join([]string{method, escapedPath, rawQuery, canonicalHeaders.String(), signedHeaders, payloadHash}, "\n")
	scope := date + "/" + region + "/s3/aws4_request"
	stringToSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + sha256Hex([]byte(canonicalRequest))
	key := hmacSHA256([]byte("AWS4"+secretKey), date)
	key = hmacSHA256(key, region)
	key = hmacSHA256(key, "s3")
	key = hmacSHA256(key, "aws4_request")
	return accessKey + "/" + scope, signedHeaders, hex.EncodeToString(hmacSHA256(key, stringToSign))
}

// signS3Request 签名 PutObject 请求（签名头：content-type、host、x-amz-content-sha256、x-amz-date）。
func signS3Request(req *http.Request, payload []byte, cfg Config, now time.Time) {
	region := cfg.S3Region
	if region == "" {
		region = "us-east-1"
	}
	amzDate := now.Format("20060102T150405Z")
	payloadHash := sha256Hex(payload)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	credential, signedHeaders, signature := sigV4(req.Method, req.URL.EscapedPath(), req.URL.RawQuery, map[string]string{
		"content-type": req.Header.Get("Content-Type"), "host": req.URL.Host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate,
	}, payloadHash, cfg.S3AccessKey, cfg.S3SecretKey, region, now)
	req.Header.Set("Authorization", fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s, SignedHeaders=%s, Signature=%s", credential, signedHeaders, signature))
}
