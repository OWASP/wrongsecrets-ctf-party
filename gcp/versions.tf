terraform {
  required_version = "~> 1.1"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.9.0"
    }
    random = {
      version = "~> 3.5.1"
      source  = "hashicorp/random"
    }
    http = {
      version = "~> 3.4.0"
      source  = "hashicorp/http"
    }
  }
}
