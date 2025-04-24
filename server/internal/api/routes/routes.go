package routes

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/hotvault/backend/config"
	_ "github.com/hotvault/backend/docs" // This line is needed for swagger
	"github.com/hotvault/backend/internal/api/handlers"
	"github.com/hotvault/backend/internal/api/middleware"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"gorm.io/gorm"
)

// @title Hot Vault Backend API
// @version 1.0
// @description API Server for Hot Vault Backend Application
// @host localhost:8080
// @BasePath /api/v1

func SetupRoutes(router *gin.Engine, db *gorm.DB, cfg *config.Config) {
	handlers.Initialize(db, cfg)

	router.MaxMultipartMemory = 1000 << 20 // 1000 MB

	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "https://hotvault-demo-app.yourdomain.com"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * 60 * 60,
	}))

	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	authHandler := handlers.NewAuthHandler(db, cfg)

	v1 := router.Group("/api/v1")
	{
		v1.GET("/health", handlers.HealthCheck)

		auth := v1.Group("/auth")
		{
			auth.POST("/nonce", authHandler.GenerateNonce)
			auth.POST("/verify", authHandler.VerifySignature)
			auth.GET("/status", authHandler.CheckAuthStatus)
			auth.POST("/logout", authHandler.Logout)
		}

		protected := v1.Group("")
		protected.Use(middleware.JWTAuth(cfg.JWT.Secret))
		{
			protected.POST("/upload", handlers.UploadFile)
			protected.GET("/upload/status/:jobId", handlers.GetUploadStatus)
			protected.GET("/download/:cid", handlers.DownloadFile)

			chunkedUpload := protected.Group("/chunked-upload")
			{
				chunkedUpload.POST("/init", handlers.InitChunkedUpload)
				chunkedUpload.POST("/chunk", handlers.UploadChunk)
				chunkedUpload.POST("/complete", handlers.CompleteChunkedUpload)
				chunkedUpload.GET("/status/:uploadId", handlers.GetChunkedUploadStatus)
			}

			pieces := protected.Group("/pieces")
			{
				pieces.GET("", handlers.GetUserPieces)
				pieces.GET("/proof-sets", handlers.GetProofSets)
				pieces.GET("/:id", handlers.GetPieceByID)
				pieces.GET("/cid/:cid", handlers.GetPieceByCID)
				pieces.GET("/proofs", handlers.GetPieceProofs)
			}

			proofset := protected.Group("/proofset")
			{
				proofset.GET("/id", handlers.GetUserProofSetID)
			}

			protected.POST("/proof-set/create", authHandler.CreateProofSet)

			roots := protected.Group("/roots")
			{
				roots.POST("/remove", handlers.RemoveRoot)
			}
		}
	}

	router.NoRoute(handlers.NotFound)
}
