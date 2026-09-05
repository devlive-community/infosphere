package auth

import (
	"testing"
)

func TestGenerateAndParseToken(t *testing.T) {
	token, err := GenerateToken("test-secret", 42, "alice", "admin")
	if err != nil {
		t.Fatalf("签发令牌失败: %v", err)
	}
	claims, err := ParseToken("test-secret", token)
	if err != nil {
		t.Fatalf("解析令牌失败: %v", err)
	}
	if claims.UserID != 42 || claims.Username != "alice" || claims.Role != "admin" {
		t.Fatalf("令牌载荷不匹配: %+v", claims)
	}
}

func TestParseTokenRejectsTampered(t *testing.T) {
	token, _ := GenerateToken("test-secret", 1, "bob", "user")
	if _, err := ParseToken("wrong-secret", token); err == nil {
		t.Fatal("错误密钥不应通过校验")
	}
}

func TestParseTokenRejectsEmpty(t *testing.T) {
	if _, err := ParseToken("test-secret", ""); err == nil {
		t.Fatal("空令牌不应通过校验")
	}
	if _, err := ParseToken("test-secret", "not-a-jwt"); err == nil {
		t.Fatal("非法令牌不应通过校验")
	}
}
