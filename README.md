<p align="center">
  <a href="https://agenticstorefront.com/">
    <picture>
      <img alt="Animated UCP Logo" src="https://github.com/ForkPoint/ucp-sfcc/docs/logos/ucp-logo.svg">
    </picture>
  </a>
</p>

# UCP (Universal Commerce Protocol) Integration for SFCC

This cartridge implements the UCP specification for Salesforce Commerce Cloud (SFCC), enabling standardized checkout sessions and order management through a REST API.

## Overview

The UCP integration provides the following capabilities:
- Discovery endpoint (`.well-known/ucp`)
- Checkout session management
- Discount handling
- Fulfillment options
- Order completion

## Implementation

### Architecture

The implementation consists of:

1. **Controller** (`cartridges/int_ucp/cartridge/controllers/RedirectURL.js`)
   - Extends the base RedirectURL controller
   - Routes UCP requests to the appropriate middleware handlers
   - Handles HTTP methods: GET, POST, PUT

2. **Middleware** (`cartridges/int_ucp/cartridge/scripts/middleware/ucp.js`)
   - `handleUCPDiscoveryRequest()` - Returns UCP capabilities and payment handlers
   - `handleCreateCheckoutSessionRequest()` - Creates a new checkout session
   - `handleModifyBasketRequest()` - Updates an existing checkout session
   - `handleCompleteOrderRequest()` - Completes the checkout and creates an order

3. **Helpers** (`cartridges/int_ucp/cartridge/scripts/helpers/ucpHelpers.js`)
   - Configuration management
   - Capability mapping

4. **Custom Objects**
   - `UCPCheckoutSession` - Stores checkout session data
   - `UCPTokenizer` - Stores tokenized payment data
   - Defined in `metadata/meta/custom.UCPCheckoutSession.ucp.xml`
   - Defined in `metadata/meta/custom.UCPTokenizer.ucp.xml`

### Endpoints

#### GET `/.well-known/ucp`
Returns the UCP discovery document with supported capabilities and payment handlers.

**Response:** 200 OK
```json
{
  "ucp": {
    "version": "2026-01-11",
    "services": { ... },
    "capabilities": [ ... ]
  },
  "payment": {
    "handlers": [ ... ]
  }
}
```

#### POST `/checkout-sessions`
Creates a new checkout session.

**Request Body:**
```json
{
  "line_items": [
    {
      "item": {
        "id": "product_id",
        "title": "Product Title"
      },
      "quantity": 1
    }
  ],
  "buyer": {
    "full_name": "John Doe",
    "email": "john@example.com"
  },
  "currency": "USD",
  "payment": { ... }
}
```

**Response:** 201 Created

#### PUT `/checkout-sessions/{session_id}`
Updates an existing checkout session (add items, apply discounts, select fulfillment).

**Request Body:** Similar to POST, with updates

**Response:** 200 OK

#### POST `/checkout-sessions/{session_id}/complete`
Completes the checkout and creates an order.

**Request Body:**
```json
{
  "payment_data": {
    "handler_id": "mock_payment_handler",
    "credential": {
      "type": "token",
      "token": "success_token"
    }
  },
  "risk_signals": {
    "ip": "127.0.0.1",
    "browser": "user-agent"
  }
}
```

**Response:** 200 OK with order details

## Features

### Line Items
- Automatic line item ID generation
- Product title and price lookup
- Quantity management
- Per-item and total calculations

### Discounts
- Discount code support
- Automatic discount calculation (e.g., "10OFF" = 10% off)
- Discount allocations

### Fulfillment
- Shipping destination management
- Shipping method selection
- Dynamic shipping options based on destination
- Free and express shipping options

### Order Completion
- Order ID generation
- Permalink creation
- Status management

## Configuration

### Payment Handlers
- Credit Card (CREDIT_CARD)

### Destinations
Shipping destinations are taken from the store's addresses.

## Installation

1. Upload the cartridge to your SFCC instance
2. Add `int_ucp` to your cartridge path
3. Import the site preference metadata: `metadata/meta/system.SitePreferences.ucp.xml`
4. Import the custom object metadata: `metadata/meta/custom.UCPCheckoutSession.ucp.xml`
5. Import the custom type metadata: `metadata/meta/custom.UCPTokenizer.ucp.xml`
6. Upload the code

## Support

For issues or questions, refer to the UCP specification at https://ucp.dev/ or contact us at ucp@forkpoint.com
