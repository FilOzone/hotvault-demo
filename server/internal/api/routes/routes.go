package routes

import (
	"github.com/fws/backend/config"
	_ "github.com/fws/backend/docs" // This line is needed for swagger
	"github.com/fws/backend/internal/api/handlers"
	"github.com/fws/backend/internal/api/middleware"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"gorm.io/gorm"
)

func SetupRoutes(router *gin.Engine, db *gorm.DB, cfg *config.Config) {
	handlers.Initialize(db, cfg)

	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "https://fws-demo-app.yourdomain.com"}, // Update with your domains
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

			pieces := protected.Group("/pieces")
			{
				pieces.GET("", handlers.GetUserPieces)
				pieces.GET("/:id", handlers.GetPieceByID)
				pieces.GET("/cid/:cid", handlers.GetPieceByCID)
				pieces.GET("/proofs", handlers.GetPieceProofs)
			}

			roots := protected.Group("/roots")
			{
				roots.POST("/remove", handlers.RemoveRoot)
			}
		}
	}

	router.NoRoute(handlers.NotFound)
}
