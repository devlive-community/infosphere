// Package safehttp 访问用户提供的外部地址（网页采集、外链图片本地化等）时使用的安全 HTTP 客户端：
// 只允许 http(s)、拒绝解析到本机/内网/链路本地地址的主机（含重定向目标与实际拨号地址，防 DNS 重绑定），
// 并限制响应体大小与超时，防止 SSRF 与资源耗尽。
package safehttp

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// ErrPrivateHost 目标解析到本机或内网地址。
var ErrPrivateHost = errors.New("不允许访问本机或内网地址")

// IsPublicIP 是否为公网地址。
func IsPublicIP(ip net.IP) bool {
	return ip != nil && !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsUnspecified() &&
		!ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast() && !ip.IsMulticast()
}

// ValidatePublicHost 校验主机名解析结果全部为公网地址。
func ValidatePublicHost(ctx context.Context, host string) error {
	host = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
	if host == "" || host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return ErrPrivateHost
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil || len(ips) == 0 {
		return errors.New("无法解析网页地址")
	}
	for _, ip := range ips {
		if !IsPublicIP(ip) {
			return ErrPrivateHost
		}
	}
	return nil
}

// NewClient 安全客户端：拨号时再次校验解析地址、最多 5 次重定向且目标同样校验、响应体最多读取 limit 字节。
func NewClient(ctx context.Context, limit int64) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 20 * time.Second}
	transport := &http.Transport{
		DialContext: func(dialCtx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIP(dialCtx, "ip", host)
			if err != nil || len(ips) == 0 {
				return nil, errors.New("无法解析网页地址")
			}
			for _, ip := range ips {
				if !IsPublicIP(ip) {
					return nil, ErrPrivateHost
				}
			}
			return dialer.DialContext(dialCtx, network, net.JoinHostPort(ips[0].String(), port))
		},
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
		IdleConnTimeout:       30 * time.Second,
	}
	return &http.Client{
		Transport: &limitedTransport{base: transport, limit: limit},
		Timeout:   30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("网页重定向次数过多")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return errors.New("网页重定向到了不支持的协议")
			}
			return ValidatePublicHost(ctx, req.URL.Hostname())
		},
	}
}

type limitedTransport struct {
	base  http.RoundTripper
	limit int64
}

func (t *limitedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	response, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	response.Body = &limitedReadCloser{Reader: io.LimitReader(response.Body, t.limit), Closer: response.Body}
	return response, nil
}

type limitedReadCloser struct {
	io.Reader
	io.Closer
}
