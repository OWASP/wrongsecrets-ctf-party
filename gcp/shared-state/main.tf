terraform {
  required_version = "~> 1.1"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      version = "~> 3.0"
      source  = "hashicorp/random"
    }
  }
}


provider "google" {
  project = var.project_id
  region  = var.region
}

resource "random_id" "suffix" {
  byte_length = 4
}

resource "google_storage_bucket" "state_bucket" {
  name          = "tfstate-wrongsecrets-${random_id.suffix.hex}"
  location      = var.region
  force_destroy = true

  versioning {
    enabled = true
  }
}
