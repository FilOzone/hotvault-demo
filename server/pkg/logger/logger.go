package logger

import (
	"os"

	"github.com/sirupsen/logrus"
)

type Logger interface {
	Debug(message string)
	Info(message string)
	Warning(message string)
	Error(message string)
	Fatal(message string)
	WithField(key string, value interface{}) Logger
}

type LogrusLogger struct {
	logger *logrus.Logger
	entry  *logrus.Entry
}

func NewLogger() Logger {
	logger := logrus.New()
	logger.SetOutput(os.Stdout)
	logger.SetFormatter(&logrus.JSONFormatter{})

	env := os.Getenv("ENV")
	if env == "production" {
		logger.SetLevel(logrus.InfoLevel)
	} else {
		logger.SetLevel(logrus.DebugLevel)
	}

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
