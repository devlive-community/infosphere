package storage

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// 上传令牌：AK:encodedSign:encodedPolicy，HMAC-SHA1 用 SK 对 encodedPolicy 签名
func TestUploadToken(t *testing.T) {
	token := UploadToken("test-ak", "test-sk", "test-bucket", 1700000000)
	parts := strings.Split(token, ":")
	if len(parts) != 3 || parts[0] != "test-ak" {
		t.Fatalf("令牌格式异常: %q", token)
	}
	// encodedPolicy 可解码回 putPolicy
	policyRaw, err := base64.URLEncoding.WithPadding(base64.NoPadding).DecodeString(parts[2])
	if err != nil {
		t.Fatalf("putPolicy 应为 urlsafe base64: %v", err)
	}
	var policy map[string]any
	if err := json.Unmarshal(policyRaw, &policy); err != nil {
		t.Fatalf("putPolicy 应为合法 JSON: %v", err)
	}
	if policy["scope"] != "test-bucket" || policy["deadline"].(float64) != 1700000000 {
		t.Fatalf("putPolicy 内容异常: %v", policy)
	}
	// encodedSign 可用 SK 重算验证
	mac := hmac.New(sha1.New, []byte("test-sk"))
	mac.Write([]byte(parts[2]))
	want := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(mac.Sum(nil))
	if parts[1] != want {
		t.Fatalf("签名不匹配: got %q want %q", parts[1], want)
	}
}

func TestLocalUploader(t *testing.T) {
	dir := t.TempDir()
	up := &LocalUploader{dataDir: dir}
	url, err := up.Upload("20260102-abcdef.png", []byte("fake-image"))
	if err != nil {
		t.Fatalf("上传失败: %v", err)
	}
	if url != "/uploads/20260102-abcdef.png" {
		t.Fatalf("本地驱动应返回 /uploads 相对地址: %q", url)
	}
	data, err := os.ReadFile(filepath.Join(dir, "uploads", "20260102-abcdef.png"))
	if err != nil || string(data) != "fake-image" {
		t.Fatalf("文件未落盘或内容不符: %v %q", err, data)
	}
}

// FromConfig：qiniu 凭据不完整时必须回退 local
func TestFromConfigFallback(t *testing.T) {
	dir := t.TempDir()
	incomplete := Config{Driver: "qiniu", QiniuAccessKey: "ak", QiniuSecretKey: "sk", QiniuBucket: "b"}
	if _, ok := FromConfig(incomplete, dir).(*LocalUploader); !ok {
		t.Fatal("凭据不完整应回退 local 驱动")
	}
	complete := incomplete
	complete.QiniuDomain = "https://cdn.example.com"
	if _, ok := FromConfig(complete, dir).(*QiniuUploader); !ok {
		t.Fatal("凭据完整应选择 qiniu 驱动")
	}
	if _, ok := FromConfig(Config{Driver: "local"}, dir).(*LocalUploader); !ok {
		t.Fatal("local 驱动选择异常")
	}
}

// 七牛上传：构造一个模拟上传端点，断言 multipart 字段（token 格式/key/文件内容）与返回 URL
func TestQiniuUploaderUpload(t *testing.T) {
	var gotToken, gotKey, gotFile string
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			t.Errorf("解析 multipart 失败: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		gotToken = r.FormValue("token")
		gotKey = r.FormValue("key")
		file, _, err := r.FormFile("file")
		if err != nil {
			t.Errorf("缺少 file 字段: %v", err)
			return
		}
		defer file.Close()
		raw := make([]byte, 16)
		n, _ := file.Read(raw)
		gotFile = string(raw[:n])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"key":"` + gotKey + `","hash":"fakehash"}`))
	}))
	defer fake.Close()

	up := &QiniuUploader{
		cfg:  Config{QiniuAccessKey: "ak-123", QiniuSecretKey: "sk-456", QiniuBucket: "infosphere", QiniuDomain: "https://cdn.example.com/"},
		host: fake.URL,
	}
	url, err := up.Upload("20260102-abc.png", []byte("fake-image-bytes"))
	if err != nil {
		t.Fatalf("上传失败: %v", err)
	}
	if url != "https://cdn.example.com/20260102-abc.png" {
		t.Fatalf("返回 URL 应拼 CDN 域名: %q", url)
	}
	if gotKey != "20260102-abc.png" || gotFile != "fake-image-bytes" {
		t.Fatalf("multipart 字段异常: key=%q file=%q", gotKey, gotFile)
	}
	// token 可用测试密钥复算校验
	parts := strings.Split(gotToken, ":")
	if len(parts) != 3 || parts[0] != "ak-123" {
		t.Fatalf("token 格式异常: %q", gotToken)
	}
	mac := hmac.New(sha1.New, []byte("sk-456"))
	mac.Write([]byte(parts[2]))
	want := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(parts[1]), []byte(want)) {
		t.Fatal("token 签名不匹配")
	}
	_ = reflect.DeepEqual
}
