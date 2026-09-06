package httpx

import "github.com/gin-gonic/gin"

type response struct {
	Success bool      `json:"success"`
	Data    any       `json:"data,omitempty"`
	Error   *apiError `json:"error,omitempty"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func OK(c *gin.Context, status int, data any) {
	c.JSON(status, response{Success: true, Data: data})
}

func Error(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, response{Success: false, Error: &apiError{Code: code, Message: message}})
}
