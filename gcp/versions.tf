terraform {
  required_version = "~> 1.1"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.26.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.26.0"
    }
    random = {
      version = "~> 3.9.0"
      source  = "hashicorp/random"
    }
    http = {
      version = "~> 3.6.0"
      source  = "hashicorp/http"
    }
  }
}
