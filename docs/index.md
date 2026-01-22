---
layout: default
title: Home
description: Welcome to the UCP SFCC Cartridge Documentation
---

# Welcome to UCP SFCC Cartridge Documentation

The **Universal Commerce Protocol (UCP)** cartridge for Salesforce Commerce Cloud enables standardized checkout sessions and order management through a REST API, simplifying integration between SFCC and modern commerce platforms.

## What is UCP?

The UCP cartridge implements the [Universal Commerce Protocol specification](https://ucp.dev/), providing a standardized way to integrate checkout and order management with Salesforce Commerce Cloud. This allows any UCP-compliant platform to seamlessly integrate with your SFCC storefront.

## Key Features

### 🛒 Standardized Checkout Sessions
Create and manage checkout sessions using the UCP specification with full session lifecycle management. Supports creating, retrieving, modifying, and completing checkout sessions through a standardized API.

### 💳 Payment Handler Support
Integrate with various payment providers through UCP payment handlers with tokenization support. Secure payment processing with support for multiple payment methods and providers.

### 📦 Flexible Fulfillment Options
Configure shipping methods and destinations dynamically based on buyer location and preferences. Progressive disclosure ensures optimal performance and user experience.

### 🎫 Discount Management
Apply and manage discount codes and promotions with automatic calculation and allocation. Support for percentage-based and fixed-amount discounts with proper line item allocation.

### ✅ Order Completion
Complete orders with proper validation, error handling, and comprehensive order details. Includes risk signal support and secure payment credential handling.

## Quick Start

Get up and running with the UCP cartridge in minutes:

1. **Review the [Installation Guide]({{ '/sfcc-cartridge.html#installation' | relative_url }})** - Step-by-step setup instructions
2. **Configure in SFCC Business Manager** - Set up payment handlers and shipping methods
3. **Test the Discovery Endpoint** - Verify installation with `GET /.well-known/ucp`
4. **Start Integrating** - Connect UCP-compliant platforms to your storefront

## Documentation

📚 **[Complete SFCC Cartridge Guide]({{ '/sfcc-cartridge.html' | relative_url }})**

Comprehensive technical documentation covering:
- Architecture and implementation details
- API endpoint reference
- Configuration options
- Use cases and best practices

## Resources

- 🔗 [UCP Specification](https://ucp.dev/) - Official UCP protocol specification
- 📖 [SFCC Developer Documentation](https://developer.salesforce.com/docs/commerce/commerce-api/overview) - Salesforce Commerce Cloud API docs
- 💬 [Support](mailto:ucp@forkpoint.com) - Get help with the cartridge

---

Ready to get started? Check out the [complete documentation]({{ '/sfcc-cartridge.html' | relative_url }}) →

