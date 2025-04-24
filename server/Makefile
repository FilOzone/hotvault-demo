.PHONY: build run test clean postgres-start postgres-stop swagger swagger-install

# Go binary path
GOPATH=$(shell go env GOPATH)
SWAG_BIN=$(GOPATH)/bin/swag

# Build the application
build:
	go build -o bin/api cmd/api/main.go

# Run the application
run:
	go run cmd/api/main.go

# Run tests
test:
	go test -v ./...

# Clean build artifacts
clean:
	rm -rf bin/ docs/

# Format code
fmt:
	go fmt ./...

# Check for linting issues
lint:
	golangci-lint run

# Install Swagger tools
swagger-install:
	go install github.com/swaggo/swag/cmd/swag@latest
	@echo "Swagger tools installed successfully"

# Generate Swagger documentation
swagger: swagger-install clean
	$(SWAG_BIN) init -g internal/api/routes/routes.go --parseDependency --parseInternal --output docs
	@echo "Swagger documentation generated successfully"
	@echo "View the documentation at http://localhost:8080/swagger/index.html when the server is running"

# Start PostgreSQL in Docker
postgres-start:
	docker run --name hotvault-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fws_db -p 5432:5432 -d postgres:14
	@echo "PostgreSQL started on port 5432"
	@echo "User: postgres, Password: postgres, Database: fws_db"

# Stop and remove PostgreSQL Docker container
postgres-stop:
	docker stop hotvault-postgres && docker rm hotvault-postgres || true
	@echo "PostgreSQL container stopped and removed"

# Create database migration
migrate:
	@echo "Creating migration..."
	@read -p "Enter migration name: " name; \
	mkdir -p migrations; \
	touch migrations/`date +%Y%m%d%H%M%S`_$$name.sql

# Copy .env.example to .env if it doesn't exist
env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo ".env file created. Please update it with your configuration."; \
	else \
		echo ".env file already exists."; \
	fi

# Initialize the project
init: env postgres-start build swagger

# Help command
help:
	@echo "Available commands:"
	@echo "  make build           - Build the application"
	@echo "  make run             - Run the application"
	@echo "  make test            - Run tests"
	@echo "  make clean           - Clean build artifacts"
	@echo "  make fmt             - Format code"
	@echo "  make lint            - Check for linting issues"
	@echo "  make swagger-install  - Install Swagger tools"
	@echo "  make swagger         - Generate Swagger documentation"
	@echo "  make postgres-start  - Start PostgreSQL in Docker"
	@echo "  make postgres-stop   - Stop and remove PostgreSQL container"
	@echo "  make migrate         - Create a new migration file"
	@echo "  make env             - Create .env file from .env.example"
	@echo "  make init            - Initialize the project"
	@echo "  make help            - Show this help"