package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/4H1R/roobro/internal/config"
	"github.com/4H1R/roobro/internal/meetings"
	lk "github.com/4H1R/roobro/internal/platform/livekit"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}
	if !cfg.IsDevelopment() {
		gin.SetMode(gin.ReleaseMode)
	}

	repository := meetings.NewMemoryRepository()
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			repository.Cleanup()
		}
	}()
	livekitClient := lk.NewClient(cfg)
	service := meetings.NewService(repository, livekitClient)
	handler := meetings.NewHandler(service, cfg.LiveKitAPIKey, cfg.LiveKitSecret)

	router := gin.New()
	router.Use(gin.Recovery(), gin.Logger())
	router.Use(cors.New(cors.Config{AllowOrigins: []string{cfg.FrontendURL}, AllowMethods: []string{"GET", "POST", "OPTIONS"}, AllowHeaders: []string{"Content-Type", "X-Host-Token"}, MaxAge: 12 * time.Hour}))
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "livekit_configured": livekitClient.Configured()})
	})
	handler.RegisterRoutes(router.Group("/api/v1"))

	address := fmt.Sprintf(":%d", cfg.Port)
	server := &http.Server{Addr: address, Handler: router, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	slog.Info("roobro API listening", "address", address, "livekit_configured", livekitClient.Configured())
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
