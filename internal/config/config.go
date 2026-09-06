package config

import "github.com/caarlos0/env/v11"

type Config struct {
	Environment      string `env:"APP_ENV" envDefault:"development"`
	Port             int    `env:"PORT" envDefault:"8080"`
	FrontendURL      string `env:"FRONTEND_URL" envDefault:"http://localhost:3000"`
	LiveKitHost      string `env:"LIVEKIT_HOST" envDefault:"http://localhost:7880"`
	LiveKitPublicURL string `env:"LIVEKIT_PUBLIC_URL" envDefault:"ws://localhost:7880"`
	LiveKitAPIKey    string `env:"LIVEKIT_API_KEY"`
	LiveKitSecret    string `env:"LIVEKIT_API_SECRET"`
}

func Load() (*Config, error) {
	config, err := env.ParseAs[Config]()
	if err != nil {
		return nil, err
	}
	return &config, nil
}

func (c Config) IsDevelopment() bool { return c.Environment == "development" }
