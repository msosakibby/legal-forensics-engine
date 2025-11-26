provider "aws" { region = "us-east-1" }

terraform {
  backend "s3" {
    bucket = "legal-ops-state-kibby-2025"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
  }
}

# --- BUCKETS ---
resource "aws_s3_bucket" "input" { bucket = "legal-forensic-input-v1" }
resource "aws_s3_bucket" "output" { bucket = "legal-forensic-archive-v1" }

# --- LAMBDA ROLE ---
resource "aws_iam_role" "processor" {
  name = "legal_processor_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" } }]
  })
}

# Grants: S3 (Read/Write), Logs, Textract (Handwriting), SSM (Secrets)
resource "aws_iam_role_policy" "main" {
  role = aws_iam_role.processor.name
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      { Action = ["s3:*"], Effect = "Allow", Resource = "*" },
      { Action = ["logs:*"], Effect = "Allow", Resource = "arn:aws:logs:*:*:*" },
      { Action = ["textract:*"], Effect = "Allow", Resource = "*" } 
    ]
  })
}

# --- THE WORKHORSE ---
resource "aws_lambda_function" "processor" {
  filename      = "../dist/processor.zip"
  function_name = "LegalForensicEngine"
  role          = aws_iam_role.processor.arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 900  # 15 Minutes
  memory_size   = 2048 # 2GB RAM (Needed for PDF manipulation)
  
  environment {
    variables = {
      OPENAI_API_KEY      = var.openai_api_key
      LLAMA_CLOUD_KEY     = var.llama_cloud_key
      SUPABASE_URL        = var.supabase_url
      SUPABASE_KEY        = var.supabase_key
      VECTOR_STORE_ID     = var.openai_vector_store_id
    }
  }
}

# --- TRIGGER ---
resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.input.id
  lambda_function {
    lambda_function_arn = aws_lambda_function.processor.arn
    events              = ["s3:ObjectCreated:*"]
  }
}
resource "aws_lambda_permission" "allow_s3" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.processor.arn
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.input.arn
}

