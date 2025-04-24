package logger

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
)

type Logger interface {
	Debug(message string)
	Info(message string)
	Warning(message string)
	Error(message string)
	Fatal(message string)
	WithField(key string, value interface{}) Logger
	IsDebugEnabled() bool
}

type LogrusLogger struct {
	logger *logrus.Logger
	entry  *logrus.Entry
}

type LogFormat string

const (
	JSONFormat   LogFormat = "json"
	TextFormat   LogFormat = "text"
	PrettyFormat LogFormat = "pretty"
)

type LoggingConfig struct {
	Level  string
	Format string

	DisableGORMLogging bool
	DisableGINLogging  bool

	ProductionMode bool
}

func GetLoggingConfig() LoggingConfig {
	env := strings.ToLower(os.Getenv("ENV"))
	isProduction := env == "production"

	disableGORMLogging := isProduction
	if val := strings.ToLower(os.Getenv("DISABLE_GORM_LOGGING")); val != "" {
		disableGORMLogging = val == "true" || val == "1" || val == "yes"
	}

	disableGINLogging := isProduction
	if val := strings.ToLower(os.Getenv("DISABLE_GIN_LOGGING")); val != "" {
		disableGINLogging = val == "true" || val == "1" || val == "yes"
	}

	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		if isProduction {
			logLevel = "warn"
		} else {
			logLevel = "debug"
		}
	}

	return LoggingConfig{
		Level:              logLevel,
		Format:             os.Getenv("LOG_FORMAT"),
		DisableGORMLogging: disableGORMLogging,
		DisableGINLogging:  disableGINLogging,
		ProductionMode:     isProduction,
	}
}

func NewLogger() Logger {
	logger := logrus.New()
	logger.SetOutput(os.Stdout)

	config := GetLoggingConfig()

	format := config.Format
	if format == "" {
		format = string(TextFormat)
	}

	switch strings.ToLower(format) {
	case string(JSONFormat):
		logger.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: time.RFC3339,
			PrettyPrint:     false,
		})
	case string(PrettyFormat):
		logger.SetFormatter(&logrus.TextFormatter{
			FullTimestamp:   true,
			TimestampFormat: "2006-01-02 15:04:05",
			ForceColors:     true,
			DisableQuote:    true,
		})
	default:
		logger.SetFormatter(&logrus.TextFormatter{
			FullTimestamp:   true,
			TimestampFormat: "2006-01-02 15:04:05",
			DisableColors:   false,
			DisableQuote:    true,
		})
	}

	level, err := logrus.ParseLevel(config.Level)
	if err != nil {
		level = logrus.InfoLevel
		fmt.Fprintf(os.Stderr, "Invalid LOG_LEVEL: '%s', defaulting to INFO\n", config.Level)
	}
	logger.SetLevel(level)

	return &LogrusLogger{
		logger: logger,
		entry:  nil,
	}
}

func (l *LogrusLogger) Debug(message string) {
	if l.entry != nil {
		l.entry.Debug(message)
		return
	}
	l.logger.Debug(message)
}

func (l *LogrusLogger) Info(message string) {
	if l.entry != nil {
		l.entry.Info(message)
		return
	}
	l.logger.Info(message)
}

func (l *LogrusLogger) Warning(message string) {
	if l.entry != nil {
		l.entry.Warning(message)
		return
	}
	l.logger.Warning(message)
}

func (l *LogrusLogger) Error(message string) {
	if l.entry != nil {
		l.entry.Error(message)
		return
	}
	l.logger.Error(message)
}

func (l *LogrusLogger) Fatal(message string) {
	if l.entry != nil {
		l.entry.Fatal(message)
		return
	}
	l.logger.Fatal(message)
}

func (l *LogrusLogger) WithField(key string, value interface{}) Logger {
	if l.entry == nil {
		return &LogrusLogger{
			logger: l.logger,
			entry:  l.logger.WithField(key, value),
		}
	}
	return &LogrusLogger{
		logger: l.logger,
		entry:  l.entry.WithField(key, value),
	}
}

func (l *LogrusLogger) IsDebugEnabled() bool {
	return l.logger.IsLevelEnabled(logrus.DebugLevel)
}
