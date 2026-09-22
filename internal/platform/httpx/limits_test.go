package httpx

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCreationBudgetCannotBeResetWithForwardingHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	group := router.Group("/api/v1")
	group.Use(RequestLimits())
	created := 0
	group.POST("/meetings", func(c *gin.Context) { created++; c.Status(http.StatusCreated) })
	for i := 0; i < 11; i++ {
		request := httptest.NewRequest("POST", "/api/v1/meetings", nil)
		request.RemoteAddr = fmt.Sprintf("192.0.2.1:%d", 1000+i)
		request.Header.Set("X-Forwarded-For", fmt.Sprintf("203.0.113.%d", i))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if i < 10 {
			require.Equal(t, http.StatusCreated, response.Code)
		} else {
			require.Equal(t, http.StatusTooManyRequests, response.Code)
			require.NotEmpty(t, response.Header().Get("Retry-After"))
		}
	}
	require.Equal(t, 10, created)
}

func TestInFlightBudgetIsReleased(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	group := router.Group("/api/v1")
	group.Use(RequestLimits())
	entered := make(chan struct{}, 64)
	release := make(chan struct{})
	done := make(chan int, 64)
	group.GET("/blocked", func(c *gin.Context) { entered <- struct{}{}; <-release; c.Status(http.StatusOK) })
	for i := 0; i < 64; i++ {
		go func() {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest("GET", "/api/v1/blocked", nil))
			done <- response.Code
		}()
	}
	for i := 0; i < 64; i++ {
		<-entered
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/v1/blocked", nil))
	require.Equal(t, http.StatusServiceUnavailable, response.Code)
	close(release)
	for i := 0; i < 64; i++ {
		require.Equal(t, http.StatusOK, <-done)
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/v1/blocked", nil))
	require.Equal(t, http.StatusOK, response.Code)
}
