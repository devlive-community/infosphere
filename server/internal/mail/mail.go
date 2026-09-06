// Package mail 提供找回密码等场景的邮件发送，支持两种驱动：
//   - log：仅打印到后端日志（开发期无 SMTP 时使用，重置链接可在日志中找到）
//   - smtp：标准 SMTP，587/25 端口自动尝试 STARTTLS，465 端口使用隐式 TLS
package mail

import (
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// Config 发信配置（由站点设置解析而来）
type Config struct {
	Driver   string // log | smtp
	Host     string
	Port     int
	Username string
	Password string
	From     string // 发件人地址
}

// Sender 邮件发送器
type Sender interface {
	Send(to, subject, htmlBody string) error
}

// New 按配置构建发送器；未知驱动回退到 log
func New(cfg Config) Sender {
	if cfg.Driver == "smtp" && cfg.Host != "" && cfg.From != "" {
		return smtpSender{cfg: cfg}
	}
	return logSender{from: cfg.From}
}

// logSender 开发驱动：完整内容输出到后端日志
type logSender struct{ from string }

func (s logSender) Send(to, subject, body string) error {
	log.Printf("[mail] from=%s to=%s subject=%q\nbody:\n%s", s.from, to, subject, body)
	return nil
}

// smtpSender 标准 SMTP 驱动
type smtpSender struct{ cfg Config }

func (s smtpSender) Send(to, subject, body string) error {
	addr := net.JoinHostPort(s.cfg.Host, fmt.Sprintf("%d", s.cfg.Port))
	from := s.cfg.From
	msg := buildMessage(from, to, subject, body)

	auth := smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
	if s.cfg.Port == 465 {
		// 隐式 TLS
		conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: s.cfg.Host})
		if err != nil {
			return fmt.Errorf("连接 SMTP 失败: %w", err)
		}
		client, err := smtp.NewClient(conn, s.cfg.Host)
		if err != nil {
			return fmt.Errorf("SMTP 握手失败: %w", err)
		}
		return sendWithClient(client, auth, from, to, msg)
	}

	// 25/587：明文连接，服务端支持则升级 STARTTLS
	client, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("连接 SMTP 失败: %w", err)
	}
	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: s.cfg.Host}); err != nil {
			client.Close()
			return fmt.Errorf("STARTTLS 升级失败: %w", err)
		}
	}
	return sendWithClient(client, auth, from, to, msg)
}

func sendWithClient(client *smtp.Client, auth smtp.Auth, from, to string, msg []byte) error {
	defer client.Close()
	if err := client.Auth(auth); err != nil {
		// 未配置凭据时部分服务器允许匿名发信，忽略纯凭据类错误
		if auth != nil && !strings.Contains(err.Error(), "unrecognized") {
			return fmt.Errorf("SMTP 认证失败: %w", err)
		}
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("设置发件人失败: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("设置收件人失败: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("打开数据通道失败: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("写入邮件失败: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("发送邮件失败: %w", err)
	}
	return client.Quit()
}

// buildMessage 组装 HTML 邮件；中文主题按 RFC 2047 base64 编码
func buildMessage(from, to, subject, htmlBody string) []byte {
	headers := strings.Join([]string{
		"From: InfoSphere <" + from + ">",
		"To: " + to,
		"Subject: =?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(subject)) + "?=",
		"Date: " + time.Now().Format(time.RFC1123Z),
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
	}, "\r\n")
	encoded := base64.StdEncoding.EncodeToString([]byte(htmlBody))
	// base64 每 76 字符换行（RFC 2045）
	var wrapped strings.Builder
	for i := 0; i < len(encoded); i += 76 {
		end := i + 76
		if end > len(encoded) {
			end = len(encoded)
		}
		wrapped.WriteString(encoded[i:end])
		wrapped.WriteString("\r\n")
	}
	return []byte(headers + "\r\n\r\n" + wrapped.String())
}

// ResetPasswordHTML 生成找回密码邮件正文
func ResetPasswordHTML(link string, expireMinutes int) string {
	return fmt.Sprintf(`<div style="max-width:480px;margin:0 auto;font-family:sans-serif">
<p>你好，</p>
<p>我们收到了重置你 InfoSphere 账户密码的请求。点击下面的链接设置新密码：</p>
<p><a href="%s">%s</a></p>
<p>链接 %d 分钟内有效，且只能使用一次。如果不是你本人操作，请忽略这封邮件，你的密码不会被更改。</p>
<p>InfoSphere</p>
</div>`, link, link, expireMinutes)
}
