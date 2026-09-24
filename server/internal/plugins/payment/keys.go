package payment

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"strings"
)

// 密钥解析：兼容 PEM 与支付宝/微信后台导出的纯 Base64（无头尾、可含换行）。

func keyDER(raw string) ([]byte, string) {
	raw = strings.TrimSpace(raw)
	if block, _ := pem.Decode([]byte(raw)); block != nil {
		return block.Bytes, block.Type
	}
	clean := strings.NewReplacer("\n", "", "\r", "", " ", "", "\t", "").Replace(raw)
	der, err := base64.StdEncoding.DecodeString(clean)
	if err != nil {
		return nil, ""
	}
	return der, ""
}

func parsePrivateKey(raw string) (*rsa.PrivateKey, error) {
	der, _ := keyDER(raw)
	if der == nil {
		return nil, errors.New("私钥格式无效")
	}
	if k, err := x509.ParsePKCS1PrivateKey(der); err == nil {
		return k, nil
	}
	k, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, errors.New("私钥格式无效")
	}
	rk, ok := k.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("仅支持 RSA 私钥")
	}
	return rk, nil
}

func parsePublicKey(raw string) (*rsa.PublicKey, error) {
	der, typ := keyDER(raw)
	if der == nil {
		return nil, errors.New("公钥格式无效")
	}
	if typ == "CERTIFICATE" {
		cert, err := x509.ParseCertificate(der)
		if err != nil {
			return nil, errors.New("证书格式无效")
		}
		if pk, ok := cert.PublicKey.(*rsa.PublicKey); ok {
			return pk, nil
		}
		return nil, errors.New("仅支持 RSA 公钥")
	}
	if k, err := x509.ParsePKIXPublicKey(der); err == nil {
		if pk, ok := k.(*rsa.PublicKey); ok {
			return pk, nil
		}
		return nil, errors.New("仅支持 RSA 公钥")
	}
	if pk, err := x509.ParsePKCS1PublicKey(der); err == nil {
		return pk, nil
	}
	return nil, errors.New("公钥格式无效")
}

// signSHA256 RSA-SHA256（PKCS#1 v1.5）签名，返回 Base64。
func signSHA256(key *rsa.PrivateKey, message string) (string, error) {
	sum := sha256.Sum256([]byte(message))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

// verifySHA256 校验 Base64 编码的 RSA-SHA256 签名。
func verifySHA256(key *rsa.PublicKey, message, signature string) bool {
	sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(signature))
	if err != nil {
		return false
	}
	sum := sha256.Sum256([]byte(message))
	return rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], sig) == nil
}
