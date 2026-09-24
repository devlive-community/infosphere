package storage

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// AWS 文档中的 SigV4「PUT Object」示例（examplebucket / test$file.text）。
func TestSigV4MatchesAWSExample(t *testing.T) {
	now := time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC)
	payloadHash := sha256Hex([]byte("Welcome to Amazon S3."))
	if payloadHash != "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072" {
		t.Fatalf("payload 哈希错误: %s", payloadHash)
	}
	_, signed, sig := sigV4(http.MethodPut, "/"+s3Escape("test$file.text"), "", map[string]string{
		"date": "Fri, 24 May 2013 00:00:00 GMT", "host": "examplebucket.s3.amazonaws.com", "x-amz-content-sha256": payloadHash,
		"x-amz-date": "20130524T000000Z", "x-amz-storage-class": "REDUCED_REDUNDANCY",
	}, payloadHash, "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1", now)
	if signed != "date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class" || sig != "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd" {
		t.Fatalf("签名与 AWS 示例不一致: %s %s", signed, sig)
	}
}

func TestS3UploaderPathStyle(t *testing.T) {
	var gotPath, gotAuth, gotType string
	var gotBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotAuth, gotType = r.URL.Path, r.Header.Get("Authorization"), r.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(r.Body)
		if r.Method != http.MethodPut || r.Header.Get("X-Amz-Content-Sha256") != sha256Hex(gotBody) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	cfg := Config{Driver: "s3", S3Endpoint: srv.URL, S3Region: "cn-test-1", S3Bucket: "media", S3AccessKey: "AK", S3SecretKey: "SK", S3PathStyle: true, S3Prefix: "/kf/"}
	up := FromConfig(cfg, t.TempDir())
	url, err := up.Upload("20260924-abc.png", []byte("png-bytes"))
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/media/kf/20260924-abc.png" || gotType != "image/png" || string(gotBody) != "png-bytes" {
		t.Fatalf("请求错误: %s %s %q", gotPath, gotType, gotBody)
	}
	if !strings.Contains(gotAuth, "Credential=AK/") || !strings.Contains(gotAuth, "/cn-test-1/s3/aws4_request") {
		t.Fatalf("签名头错误: %s", gotAuth)
	}
	if url != srv.URL+"/media/kf/20260924-abc.png" {
		t.Fatalf("未配置公开地址时应返回对象地址: %s", url)
	}
	cfg.S3PublicURL = "https://cdn.example.com/"
	if url, _ := FromConfig(cfg, t.TempDir()).Upload("a.png", []byte("x")); url != "https://cdn.example.com/kf/a.png" {
		t.Fatalf("应返回公开地址: %s", url)
	}
	cfg.S3SecretKey = ""
	if _, ok := FromConfig(cfg, t.TempDir()).(*LocalUploader); !ok {
		t.Fatal("凭据不完整时应回退本地存储")
	}
}

func TestS3VirtualHostURL(t *testing.T) {
	u, err := s3ObjectURL(Config{S3Endpoint: "https://oss-cn-hangzhou.aliyuncs.com", S3Bucket: "kf"}, "a b.png")
	if err != nil || u.String() != "https://kf.oss-cn-hangzhou.aliyuncs.com/a%20b.png" {
		t.Fatalf("虚拟主机风格地址错误: %v %v", u, err)
	}
}
