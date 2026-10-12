// Copyright Supabase contributors; MIT. Exact tagged source extraction, regression only.
package main

import (
	"fmt"
	"github.com/jackc/pgconn"
	"net"
	"net/url"
)

func ToPostgresURL(config pgconn.Config) string {
	timeoutSecond := int64(config.ConnectTimeout.Seconds())
	if timeoutSecond == 0 {
		timeoutSecond = 10
	}
	queryParams := fmt.Sprintf("connect_timeout=%d", timeoutSecond)
	for k, v := range config.RuntimeParams {
		queryParams += fmt.Sprintf("&%s=%s", k, url.QueryEscape(v))
	}
	// IPv6 address must be wrapped in square brackets
	host := config.Host
	if ip := net.ParseIP(host); ip != nil && ip.To4() == nil {
		host = fmt.Sprintf("[%s]", host)
	}
	return fmt.Sprintf(
		"postgresql://%s@%s:%d/%s?%s",
		url.UserPassword(config.User, config.Password),
		host,
		config.Port,
		url.PathEscape(config.Database),
		queryParams,
	)
}
