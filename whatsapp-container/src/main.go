package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
	
	_ "github.com/mattn/go-sqlite3"
)

type WhatsAppInstance struct {
	Client      *whatsmeow.Client
	PhoneNumber string
	SessionPath string
	Port        int
	GatewayURL  string
}

type MessageRequest struct {
	To        string `json:"to" binding:"required"`
	Message   string `json:"message" binding:"required"`
	Type      string `json:"type"`
	Timestamp string `json:"timestamp"`
}

type MediaRequest struct {
	To      string `json:"to" binding:"required"`
	Media   string `json:"media" binding:"required"`
	Caption string `json:"caption"`
	Type    string `json:"type" binding:"required"`
}

type Response struct {
	Success   bool        `json:"success"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
	Error     string      `json:"error,omitempty"`
	Timestamp string      `json:"timestamp"`
}

var instance *WhatsAppInstance

func main() {
	// Get environment variables
	phoneNumber := os.Getenv("PHONE_NUMBER")
	if phoneNumber == "" {
		log.Fatal("PHONE_NUMBER environment variable is required")
	}

	sessionPath := os.Getenv("SESSION_PATH")
	if sessionPath == "" {
		sessionPath = "/app/sessions"
	}

	portStr := os.Getenv("API_PORT")
	if portStr == "" {
		portStr = "3001"
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		log.Fatal("Invalid API_PORT:", err)
	}

	gatewayURL := os.Getenv("GATEWAY_URL")
	if gatewayURL == "" {
		gatewayURL = "http://api-gateway:3000"
	}

	// Initialize WhatsApp instance
	instance = &WhatsAppInstance{
		PhoneNumber: phoneNumber,
		SessionPath: sessionPath,
		Port:        port,
		GatewayURL:  gatewayURL,
	}

	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)

	// Create router
	r := gin.Default()

	// Middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		
		c.Next()
	})

	// Routes
	r.GET("/health", healthCheck)
	r.GET("/status", getStatus)
	r.GET("/qr", getQRCode)
	r.POST("/send-message", sendMessage)
	r.POST("/send-media", sendMedia)
	r.POST("/refresh-qr", refreshQR)
	r.GET("/message-history", getMessageHistory)

	// Initialize WhatsApp client
	go func() {
		if err := instance.InitializeClient(); err != nil {
			log.Printf("Error initializing WhatsApp client: %v", err)
		}
	}()

	// Start server
	log.Printf("WhatsApp container started for %s on port %d", phoneNumber, port)
	if err := r.Run(fmt.Sprintf(":%d", port)); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func (wa *WhatsAppInstance) InitializeClient() error {
	// Create database connection
	dbLog := waLog.Stdout("Database", "DEBUG", true)
	container, err := sqlstore.New("sqlite3", fmt.Sprintf("file:%s/whatsapp.db?_foreign_keys=on", wa.SessionPath), dbLog)
	if err != nil {
		return fmt.Errorf("failed to create database: %v", err)
	}

	// Get device store
	deviceStore, err := container.GetFirstDevice()
	if err != nil {
		return fmt.Errorf("failed to get device: %v", err)
	}

	// Create client
	clientLog := waLog.Stdout("Client", "INFO", true)
	wa.Client = whatsmeow.NewClient(deviceStore, clientLog)

	// Add event handler
	wa.Client.AddEventHandler(wa.eventHandler)

	// Connect
	if wa.Client.Store.ID == nil {
		// No session, need to login
		qrChan, _ := wa.Client.GetQRChannel(context.Background())
		err = wa.Client.Connect()
		if err != nil {
			return fmt.Errorf("failed to connect: %v", err)
		}

		for evt := range qrChan {
			if evt.Event == "code" {
				// Send QR code to gateway
				wa.sendQRToGateway(evt.Code)
			} else {
				log.Printf("QR channel event: %s", evt.Event)
			}
		}
	} else {
		// Existing session
		err = wa.Client.Connect()
		if err != nil {
			return fmt.Errorf("failed to connect: %v", err)
		}
	}

	log.Printf("WhatsApp client initialized for %s", wa.PhoneNumber)
	return nil
}

func (wa *WhatsAppInstance) eventHandler(evt interface{}) {
	switch v := evt.(type) {
	case *events.Connected:
		log.Printf("WhatsApp connected for %s", wa.PhoneNumber)
		wa.notifyGateway("connected", map[string]interface{}{
			"phone_number": wa.PhoneNumber,
			"connected_at": time.Now().Format(time.RFC3339),
		})
		
	case *events.Disconnected:
		log.Printf("WhatsApp disconnected for %s", wa.PhoneNumber)
		wa.notifyGateway("disconnected", map[string]interface{}{
			"phone_number": wa.PhoneNumber,
			"disconnected_at": time.Now().Format(time.RFC3339),
		})
		
	case *events.QR:
		log.Printf("QR code received for %s", wa.PhoneNumber)
		wa.sendQRToGateway(v.Codes[0])
		
	case *events.Message:
		log.Printf("Message received for %s from %s", wa.PhoneNumber, v.Info.Sender)
		// Handle incoming messages if needed
	}
}

func (wa *WhatsAppInstance) sendQRToGateway(qrCode string) {
	payload := map[string]interface{}{
		"phone_number": wa.PhoneNumber,
		"qr_code":      qrCode,
		"timestamp":    time.Now().Format(time.RFC3339),
	}

	jsonData, _ := json.Marshal(payload)
	
	// Send to gateway (implement HTTP request)
	go func() {
		client := &http.Client{Timeout: 10 * time.Second}
		req, _ := http.NewRequest("POST", wa.GatewayURL+"/api/devices/"+wa.PhoneNumber+"/qr-update", 
			strings.NewReader(string(jsonData)))
		req.Header.Set("Content-Type", "application/json")
		client.Do(req)
	}()
}

func (wa *WhatsAppInstance) notifyGateway(event string, data map[string]interface{}) {
	payload := map[string]interface{}{
		"phone_number": wa.PhoneNumber,
		"event":        event,
		"data":         data,
		"timestamp":    time.Now().Format(time.RFC3339),
	}

	jsonData, _ := json.Marshal(payload)
	
	go func() {
		client := &http.Client{Timeout: 10 * time.Second}
		req, _ := http.NewRequest("POST", wa.GatewayURL+"/api/devices/"+wa.PhoneNumber+"/event", 
			strings.NewReader(string(jsonData)))
		req.Header.Set("Content-Type", "application/json")
		client.Do(req)
	}()
}

func healthCheck(c *gin.Context) {
	status := "healthy"
	if instance.Client == nil || !instance.Client.IsConnected() {
		status = "unhealthy"
	}

	c.JSON(200, Response{
		Success: true,
		Data: map[string]interface{}{
			"status":       status,
			"phone_number": instance.PhoneNumber,
			"connected":    instance.Client != nil && instance.Client.IsConnected(),
			"timestamp":    time.Now().Format(time.RFC3339),
		},
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

func getStatus(c *gin.Context) {
	var status string
	var connected bool
	
	if instance.Client == nil {
		status = "initializing"
		connected = false
	} else if instance.Client.IsConnected() {
		status = "connected"
		connected = true
	} else {
		status = "disconnected"
		connected = false
	}

	c.JSON(200, Response{
		Success: true,
		Data: map[string]interface{}{
			"phone_number": instance.PhoneNumber,
			"status":       status,
			"connected":    connected,
			"session_exists": instance.Client != nil && instance.Client.Store.ID != nil,
		},
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

func getQRCode(c *gin.Context) {
	if instance.Client == nil {
		c.JSON(503, Response{
			Success:   false,
			Error:     "Client not initialized",
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	// This would require implementing QR code generation
	// For now, return a placeholder
	c.JSON(200, Response{
		Success: true,
		Message: "QR code will be sent via webhook",
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

func sendMessage(c *gin.Context) {
	var req MessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, Response{
			Success:   false,
			Error:     err.Error(),
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	if instance.Client == nil || !instance.Client.IsConnected() {
		c.JSON(503, Response{
			Success:   false,
			Error:     "WhatsApp not connected",
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	// Parse recipient number
	recipient, err := types.ParseJID(req.To)
	if err != nil {
		c.JSON(400, Response{
			Success:   false,
			Error:     "Invalid recipient number",
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	// Send message
	msg := &waProto.Message{
		Conversation: proto.String(req.Message),
	}

	resp, err := instance.Client.SendMessage(context.Background(), recipient, msg)
	if err != nil {
		c.JSON(500, Response{
			Success:   false,
			Error:     err.Error(),
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	c.JSON(200, Response{
		Success: true,
		Message: "Message sent successfully",
		Data: map[string]interface{}{
			"message_id": resp.ID,
			"to":         req.To,
			"timestamp":  resp.Timestamp.Format(time.RFC3339),
		},
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

func sendMedia(c *gin.Context) {
	// Implementation for media messages
	c.JSON(501, Response{
		Success:   false,
		Error:     "Media messages not implemented yet",
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

func refreshQR(c *gin.Context) {
	// Implementation for QR refresh
	c.JSON(200, Response{
		Success:   true,
		Message:   "QR refresh requested",
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

func getMessageHistory(c *gin.Context) {
	// Implementation for message history
	c.JSON(501, Response{
		Success:   false,
		Error:     "Message history not implemented yet",
		Timestamp: time.Now().Format(time.RFC3339),
	})
}