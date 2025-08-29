#!/bin/bash

# Script to test PWA functionality in production mode

echo "Building for production..."
npm run build

echo "Starting production server..."
npm start
