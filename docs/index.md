---
layout: default
title: UCP SFCC Cartridge Documentation - Universal Commerce Protocol for Salesforce Commerce Cloud
description: Documentation for the Universal Commerce Protocol (UCP) cartridge for Salesforce Commerce Cloud. Standardized checkout sessions, payment integration, and order management for SFCC.
---

# Welcome to UCP SFCC Cartridge Documentation

The **Universal Commerce Protocol (UCP)** cartridge for Salesforce Commerce Cloud enables standardized checkout sessions and order management through a REST API, enabling integration between SFCC and AI-powered commerce platforms.

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

<div style="margin: 2rem 0;">
  <a href="https://github.com/ForkPoint/ucp-sfcc/releases/latest" class="download-button" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; padding: 1rem 2.5rem; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 1.125rem; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1); transition: all 0.2s ease;">
    <svg style="display: inline-block; vertical-align: middle; width: 20px; height: 20px; margin-right: 8px;" viewBox="0 0 16 16" fill="currentColor">
      <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
      <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
    </svg>
    Download Latest Release
  </a>
  <p style="margin-top: 1rem; color: #64748b; font-size: 0.875rem;">Free and open source • AGPL-3.0 License</p>
</div>

**Installation Steps:**

1. **Download and extract** the cartridge files
2. **Upload** to your SFCC instance and add `int_ucp` to your cartridge path
3. **Import metadata** - Site preferences and custom objects
4. **Configure** payment handlers and shipping methods in Business Manager
5. **Test** the discovery endpoint: `GET /.well-known/ucp`

[View detailed installation guide →]({{ '/sfcc-cartridge.html#installation' | relative_url }})

## 📚 Documentation

> **Get started with the full technical documentation**
>
> Comprehensive guide covering:
> - **Architecture & Implementation** - Detailed technical overview
> - **API Endpoint Reference** - Complete API documentation with examples
> - **Installation Guide** - Step-by-step setup instructions
> - **Configuration Options** - Payment handlers, shipping, and more
> - **Use Cases & Best Practices** - Real-world implementation examples

## Resources

- 💻 [GitHub Repository](https://github.com/ForkPoint/ucp-sfcc) - Source code and issue tracker
- 🔗 [UCP Specification](https://ucp.dev/) - Official UCP protocol specification
- 📖 [SFCC Developer Documentation](https://developer.salesforce.com/docs/commerce/commerce-api/overview) - Salesforce Commerce Cloud API docs
- 💬 [Support](mailto:ucp@forkpoint.com) - Get help with the cartridge

---

## 🚀 Ready to Get Started?

### [**View Complete SFCC Cartridge Documentation →**]({{ '/sfcc-cartridge.html' | relative_url }})

