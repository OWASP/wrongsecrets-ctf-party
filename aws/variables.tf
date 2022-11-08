variable "region" {
  description = "The AWS region to use"
  type        = string
  default     = "eu-west-1"
}

variable "cluster_version" {
  description = "The EKS cluster version to use"
  type        = string
  default     = "1.23"
}

variable "cluster_name" {
  description = "The EKS cluster name"
  type        = string
  default     = "wrongsecrets-exercise-cluster"
}

variable "extra_allowed_ip_ranges" {
  description = "Allowed IP ranges in addition to creator IP"
  type        = list(string)
  default     = []
}
