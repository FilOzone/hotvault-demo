// Package docs Code generated by swaggo/swag. DO NOT EDIT
package docs

import "github.com/swaggo/swag"

const docTemplate = `{
    "schemes": {{ marshal .Schemes }},
    "swagger": "2.0",
    "info": {
        "description": "{{escape .Description}}",
        "title": "{{.Title}}",
        "contact": {},
        "version": "{{.Version}}"
    },
    "host": "{{.Host}}",
    "basePath": "{{.BasePath}}",
    "paths": {
        "/404": {
            "get": {
                "description": "Returns 404 Not Found error",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "Error"
                ],
                "summary": "Not Found",
                "responses": {
                    "404": {
                        "description": "Not Found",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    }
                }
            }
        },
        "/api/v1/download/{cid}": {
            "get": {
                "description": "Download a file from the PDP service using its CID",
                "consumes": [
                    "application/json"
                ],
                "produces": [
                    "application/octet-stream"
                ],
                "tags": [
                    "download"
                ],
                "summary": "Download a file from PDP service",
                "parameters": [
                    {
                        "type": "string",
                        "description": "CID of the file to download",
                        "name": "cid",
                        "in": "path",
                        "required": true
                    }
                ],
                "responses": {
                    "200": {
                        "description": "File content",
                        "schema": {
                            "type": "file"
                        }
                    }
                }
            }
        },
        "/api/v1/pieces": {
            "get": {
                "description": "Get all pieces uploaded by the authenticated user, including service proof set ID",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "pieces"
                ],
                "summary": "Get user's pieces",
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/internal_api_handlers.PieceResponse"
                            }
                        }
                    }
                }
            }
        },
        "/api/v1/pieces/cid/{cid}": {
            "get": {
                "description": "Get a specific piece by its CID",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "pieces"
                ],
                "summary": "Get piece by CID",
                "parameters": [
                    {
                        "type": "string",
                        "description": "Piece CID",
                        "name": "cid",
                        "in": "path",
                        "required": true
                    }
                ],
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "$ref": "#/definitions/github_com_fws_backend_internal_models.Piece"
                        }
                    }
                }
            }
        },
        "/api/v1/pieces/proof-sets": {
            "get": {
                "description": "Get all proof sets and their pieces for the authenticated user",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "pieces"
                ],
                "summary": "Get user's proof sets",
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ProofSetsResponse"
                        }
                    }
                }
            }
        },
        "/api/v1/pieces/proofs": {
            "get": {
                "description": "(DEPRECATED - Use /api/v1/pieces instead) Get all pieces with proof information",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "pieces"
                ],
                "summary": "Get user's pieces with proof data (DEPRECATED)",
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/github_com_fws_backend_internal_models.Piece"
                            }
                        }
                    }
                }
            }
        },
        "/api/v1/pieces/{id}": {
            "get": {
                "description": "Get a specific piece by its ID",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "pieces"
                ],
                "summary": "Get piece by ID",
                "parameters": [
                    {
                        "type": "string",
                        "description": "Piece ID",
                        "name": "id",
                        "in": "path",
                        "required": true
                    }
                ],
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "$ref": "#/definitions/github_com_fws_backend_internal_models.Piece"
                        }
                    }
                }
            }
        },
        "/api/v1/roots/remove": {
            "post": {
                "description": "Remove a specific root from the PDP service",
                "consumes": [
                    "application/json"
                ],
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "roots"
                ],
                "summary": "Remove roots using pdptool",
                "parameters": [
                    {
                        "description": "Remove root request data",
                        "name": "request",
                        "in": "body",
                        "required": true,
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.RemoveRootRequest"
                        }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "type": "object",
                            "additionalProperties": true
                        }
                    }
                }
            }
        },
        "/api/v1/upload": {
            "post": {
                "description": "Upload a file to the PDP service with piece preparation and returns a job ID for status polling",
                "consumes": [
                    "multipart/form-data"
                ],
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "upload"
                ],
                "summary": "Upload a file to PDP service",
                "parameters": [
                    {
                        "type": "file",
                        "description": "File to upload",
                        "name": "file",
                        "in": "formData",
                        "required": true
                    }
                ],
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.UploadProgress"
                        }
                    }
                }
            }
        },
        "/api/v1/upload/status/{jobId}": {
            "get": {
                "description": "Get the status of an upload job",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "upload"
                ],
                "summary": "Get upload status",
                "parameters": [
                    {
                        "type": "string",
                        "description": "Job ID",
                        "name": "jobId",
                        "in": "path",
                        "required": true
                    }
                ],
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.UploadProgress"
                        }
                    }
                }
            }
        },
        "/auth/logout": {
            "post": {
                "description": "Logs out the user by clearing the JWT cookie",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "Authentication"
                ],
                "summary": "Logout User",
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "type": "object",
                            "additionalProperties": {
                                "type": "string"
                            }
                        }
                    }
                }
            }
        },
        "/auth/nonce": {
            "post": {
                "description": "Generates a nonce for wallet signature authentication",
                "consumes": [
                    "application/json"
                ],
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "Authentication"
                ],
                "summary": "Generate Authentication Nonce",
                "parameters": [
                    {
                        "description": "Wallet address",
                        "name": "request",
                        "in": "body",
                        "required": true,
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.NonceRequest"
                        }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.NonceResponse"
                        }
                    },
                    "400": {
                        "description": "Bad Request",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    },
                    "500": {
                        "description": "Internal Server Error",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    }
                }
            }
        },
        "/auth/status": {
            "get": {
                "description": "Checks if the user is authenticated via cookie and if their proof set is ready",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "Authentication"
                ],
                "summary": "Check Authentication Status",
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.StatusResponse"
                        }
                    },
                    "401": {
                        "description": "Unauthorized",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    }
                }
            }
        },
        "/auth/verify": {
            "post": {
                "description": "Verifies the signature and issues a JWT token",
                "consumes": [
                    "application/json"
                ],
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "Authentication"
                ],
                "summary": "Verify Signature",
                "parameters": [
                    {
                        "description": "Address and signature",
                        "name": "request",
                        "in": "body",
                        "required": true,
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.VerifyRequest"
                        }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.VerifyResponse"
                        }
                    },
                    "400": {
                        "description": "Bad Request",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    },
                    "401": {
                        "description": "Unauthorized",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    },
                    "500": {
                        "description": "Internal Server Error",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    }
                }
            }
        },
        "/health": {
            "get": {
                "description": "Returns the health status of the API",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "Health"
                ],
                "summary": "Health Check",
                "responses": {
                    "200": {
                        "description": "OK",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.HealthResponse"
                        }
                    }
                }
            }
        },
        "/proof-set/create": {
            "post": {
                "security": [
                    {
                        "ApiKeyAuth": []
                    }
                ],
                "description": "Manually initiates the creation of a proof set for the authenticated user if one doesn't exist.",
                "produces": [
                    "application/json"
                ],
                "tags": [
                    "Proof Set"
                ],
                "summary": "Create Proof Set",
                "responses": {
                    "200": {
                        "description": "message:Proof set creation initiated successfully",
                        "schema": {
                            "type": "object",
                            "additionalProperties": true
                        }
                    },
                    "400": {
                        "description": "Bad Request",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    },
                    "401": {
                        "description": "Unauthorized",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    },
                    "500": {
                        "description": "Internal Server Error",
                        "schema": {
                            "$ref": "#/definitions/internal_api_handlers.ErrorResponse"
                        }
                    }
                }
            }
        }
    },
    "definitions": {
        "github_com_fws_backend_internal_models.Piece": {
            "type": "object",
            "properties": {
                "cid": {
                    "type": "string"
                },
                "createdAt": {
                    "type": "string"
                },
                "filename": {
                    "type": "string"
                },
                "id": {
                    "type": "integer"
                },
                "pendingRemoval": {
                    "type": "boolean"
                },
                "proofSetId": {
                    "type": "integer"
                },
                "removalDate": {
                    "type": "string"
                },
                "rootId": {
                    "type": "string"
                },
                "serviceName": {
                    "type": "string"
                },
                "serviceUrl": {
                    "type": "string"
                },
                "size": {
                    "type": "integer"
                },
                "updatedAt": {
                    "type": "string"
                },
                "user": {
                    "$ref": "#/definitions/github_com_fws_backend_internal_models.User"
                },
                "userId": {
                    "type": "integer"
                }
            }
        },
        "github_com_fws_backend_internal_models.Transaction": {
            "type": "object",
            "properties": {
                "blockHash": {
                    "type": "string"
                },
                "blockNumber": {
                    "type": "integer"
                },
                "createdAt": {
                    "type": "string"
                },
                "id": {
                    "type": "integer"
                },
                "method": {
                    "type": "string"
                },
                "status": {
                    "type": "string"
                },
                "txHash": {
                    "type": "string"
                },
                "updatedAt": {
                    "type": "string"
                },
                "userId": {
                    "type": "integer"
                },
                "value": {
                    "type": "string"
                },
                "walletAddress": {
                    "type": "string"
                }
            }
        },
        "github_com_fws_backend_internal_models.User": {
            "type": "object",
            "properties": {
                "createdAt": {
                    "type": "string"
                },
                "email": {
                    "type": "string"
                },
                "id": {
                    "type": "integer"
                },
                "nonce": {
                    "type": "string"
                },
                "transactions": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/github_com_fws_backend_internal_models.Transaction"
                    }
                },
                "updatedAt": {
                    "type": "string"
                },
                "username": {
                    "type": "string"
                },
                "walletAddress": {
                    "type": "string"
                },
                "wallets": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/github_com_fws_backend_internal_models.Wallet"
                    }
                }
            }
        },
        "github_com_fws_backend_internal_models.Wallet": {
            "type": "object",
            "properties": {
                "address": {
                    "type": "string"
                },
                "createdAt": {
                    "type": "string"
                },
                "id": {
                    "type": "integer"
                },
                "isPrimary": {
                    "type": "boolean"
                },
                "name": {
                    "type": "string"
                },
                "updatedAt": {
                    "type": "string"
                },
                "userId": {
                    "type": "integer"
                }
            }
        },
        "internal_api_handlers.ErrorResponse": {
            "type": "object",
            "properties": {
                "error": {
                    "type": "string",
                    "example": "Invalid request"
                }
            }
        },
        "internal_api_handlers.HealthResponse": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "example": "ok"
                }
            }
        },
        "internal_api_handlers.NonceRequest": {
            "description": "Request body for generating a nonce",
            "type": "object",
            "required": [
                "address"
            ],
            "properties": {
                "address": {
                    "type": "string",
                    "example": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                }
            }
        },
        "internal_api_handlers.NonceResponse": {
            "description": "Response containing the generated nonce",
            "type": "object",
            "properties": {
                "nonce": {
                    "type": "string",
                    "example": "7a39f642c2608fd2bded0c35b1612d8716757326f870b6bd3f6cb7824f2b5c6d"
                }
            }
        },
        "internal_api_handlers.PieceResponse": {
            "type": "object",
            "properties": {
                "cid": {
                    "type": "string"
                },
                "createdAt": {
                    "type": "string"
                },
                "filename": {
                    "type": "string"
                },
                "id": {
                    "type": "integer"
                },
                "pendingRemoval": {
                    "type": "boolean"
                },
                "proofSetDbId": {
                    "type": "integer"
                },
                "removalDate": {
                    "type": "string"
                },
                "rootId": {
                    "type": "string"
                },
                "serviceName": {
                    "type": "string"
                },
                "serviceProofSetId": {
                    "type": "string"
                },
                "serviceUrl": {
                    "type": "string"
                },
                "size": {
                    "type": "integer"
                },
                "updatedAt": {
                    "type": "string"
                },
                "userId": {
                    "type": "integer"
                }
            }
        },
        "internal_api_handlers.ProofSetWithPieces": {
            "type": "object",
            "properties": {
                "createdAt": {
                    "type": "string"
                },
                "id": {
                    "type": "integer"
                },
                "pieceIds": {
                    "type": "array",
                    "items": {
                        "type": "integer"
                    }
                },
                "proofSetId": {
                    "type": "string"
                },
                "serviceName": {
                    "type": "string"
                },
                "serviceUrl": {
                    "type": "string"
                },
                "transactionHash": {
                    "type": "string"
                },
                "updatedAt": {
                    "type": "string"
                }
            }
        },
        "internal_api_handlers.ProofSetsResponse": {
            "type": "object",
            "properties": {
                "pieces": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/internal_api_handlers.PieceResponse"
                    }
                },
                "proofSets": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/internal_api_handlers.ProofSetWithPieces"
                    }
                }
            }
        },
        "internal_api_handlers.RemoveRootRequest": {
            "type": "object",
            "required": [
                "pieceId"
            ],
            "properties": {
                "pieceId": {
                    "type": "integer"
                },
                "proofSetId": {
                    "type": "integer"
                },
                "rootId": {
                    "type": "string"
                },
                "serviceName": {
                    "type": "string"
                },
                "serviceUrl": {
                    "type": "string"
                }
            }
        },
        "internal_api_handlers.StatusResponse": {
            "description": "Response containing authentication status",
            "type": "object",
            "properties": {
                "address": {
                    "type": "string",
                    "example": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                },
                "authenticated": {
                    "type": "boolean",
                    "example": true
                },
                "proofSetInitiated": {
                    "type": "boolean",
                    "example": true
                },
                "proofSetReady": {
                    "type": "boolean",
                    "example": true
                }
            }
        },
        "internal_api_handlers.UploadProgress": {
            "type": "object",
            "properties": {
                "cid": {
                    "type": "string"
                },
                "error": {
                    "type": "string"
                },
                "filename": {
                    "type": "string"
                },
                "jobId": {
                    "type": "string"
                },
                "message": {
                    "type": "string"
                },
                "progress": {
                    "type": "integer"
                },
                "proofSetId": {
                    "type": "string"
                },
                "status": {
                    "type": "string"
                },
                "totalSize": {
                    "type": "integer"
                }
            }
        },
        "internal_api_handlers.VerifyRequest": {
            "description": "Request body for verifying a signature",
            "type": "object",
            "required": [
                "address",
                "signature"
            ],
            "properties": {
                "address": {
                    "type": "string",
                    "example": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                },
                "message": {
                    "type": "string",
                    "example": "Sign this message to login to Hot Vault (No funds will be transferred in this step): 7a39f642c2608fd2"
                },
                "signature": {
                    "type": "string",
                    "example": "0x1234567890abcdef"
                }
            }
        },
        "internal_api_handlers.VerifyResponse": {
            "description": "Response containing the JWT token and expiration",
            "type": "object",
            "properties": {
                "expires": {
                    "type": "integer",
                    "example": 1679529600
                },
                "token": {
                    "type": "string",
                    "example": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                }
            }
        }
    }
}`

// SwaggerInfo holds exported Swagger Info so clients can modify it
var SwaggerInfo = &swag.Spec{
	Version:          "1.0",
	Host:             "localhost:8080",
	BasePath:         "/api/v1",
	Schemes:          []string{},
	Title:            "Hot Vault Backend API",
	Description:      "API Server for Hot Vault Backend Application",
	InfoInstanceName: "swagger",
	SwaggerTemplate:  docTemplate,
	LeftDelim:        "{{",
	RightDelim:       "}}",
}

func init() {
	swag.Register(SwaggerInfo.InstanceName(), SwaggerInfo)
}
