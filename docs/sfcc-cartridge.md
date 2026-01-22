---
layout: default
title: UCP SFCC Cartridge Documentation - Installation & API Guide | Salesforce Commerce Cloud Integration
description: Complete guide to installing and using the UCP cartridge for Salesforce Commerce Cloud. Learn how to integrate Universal Commerce Protocol with SFCC, configure checkout sessions, payment handlers, and order management.
nav_order: 1
---

# UCP Cartridge for Salesforce Commerce Cloud

The Universal Commerce Protocol (UCP) cartridge for Salesforce Commerce Cloud (SFCC) enables standardized checkout sessions and order management through a REST API, simplifying integration between SFCC and modern commerce platforms.

## Introducing the UCP Cartridge for SFCC

The UCP cartridge for Salesforce Commerce Cloud is designed to provide a standardized, protocol-based approach to checkout and order management. The cartridge implements the [Universal Commerce Protocol specification](https://ucp.dev/), allowing any UCP-compliant platform to integrate with your SFCC storefront seamlessly.

The cartridge enables:
- **Standardized Checkout Sessions**: Create and manage checkout sessions using the UCP specification
- **Payment Handler Support**: Integrate with various payment providers through UCP payment handlers
- **Flexible Fulfillment Options**: Configure shipping methods and destinations dynamically
- **Discount Management**: Apply and manage discount codes and promotions
- **Order Completion**: Complete orders with proper validation and error handling

## High-Level Architecture

The UCP cartridge follows a modular architecture that integrates seamlessly with SFCC's existing infrastructure:

```
┌─────────────────────────────────────────────────────────────┐
│                    UCP-Compliant Platform                    │
│                  (Collector/Commerce App)                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ REST API (UCP Protocol)
                        │
┌───────────────────────▼─────────────────────────────────────┐
│              SFCC Storefront (Cartridge)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Controller Layer (RedirectURL.js)                   │   │
│  │  - Routes UCP requests                               │   │
│  │  - Handles HTTP methods (GET, POST, PUT)             │   │
│  └───────────────────┬──────────────────────────────────┘   │
│                      │                                        │
│  ┌───────────────────▼──────────────────────────────────┐   │
│  │  Middleware Layer (ucp.js)                            │   │
│  │  - Discovery endpoint handler                         │   │
│  │  - Checkout session management                        │   │
│  │  - Order completion                                   │   │
│  └───────────────────┬──────────────────────────────────┘   │
│                      │                                        │
│  ┌───────────────────▼──────────────────────────────────┐   │
│  │  Helper Layer (ucpHelpers.js)                        │   │
│  │  - Request validation                                │   │
│  │  - Basket management                                 │   │
│  │  - Configuration management                          │   │
│  └───────────────────┬──────────────────────────────────┘   │
│                      │                                        │
│  ┌───────────────────▼──────────────────────────────────┐   │
│  │  SFCC Core Services                                  │   │
│  │  - BasketMgr (Shopping cart)                          │   │
│  │  - OrderMgr (Order creation)                          │   │
│  │  - CustomObjectMgr (Session storage)                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

- **Discovery**: UCP-compliant platforms query `/.well-known/ucp` to discover available capabilities and payment handlers
- **Session Creation**: Platform creates a checkout session via `POST /checkout-sessions` with line items, buyer info, and payment preferences
- **Session Management**: Platform can modify the session via `PUT /checkout-sessions/{session_id}` to add items, apply discounts, or select fulfillment options
- **Order Completion**: Platform completes the checkout via `POST /checkout-sessions/{session_id}/complete` with payment credentials
- **Order Processing**: SFCC creates the order and returns order details including permalink and status

## Features

### Core Capabilities

- **Discovery Endpoint**: Standardized `.well-known/ucp` endpoint for capability discovery
- **Checkout Session Management**: Create, retrieve, and modify checkout sessions
- **Line Item Management**: Add, update, and remove items from checkout sessions
- **Discount Handling**: Apply discount codes with automatic calculation
- **Fulfillment Options**: Dynamic shipping method selection based on destination
- **Payment Handler Integration**: Support for multiple payment handlers via UCP specification
- **Order Completion**: Secure order creation with validation and error handling
- **Session Persistence**: Checkout sessions stored in SFCC custom objects for reliability

### Advanced Features

- **Progressive Disclosure**: Fulfillment options returned only when requested
- **Buyer Information Management**: Support for guest and registered customer checkout
- **Marketing Consent**: Capture and store buyer consent preferences
- **Risk Signals**: Support for fraud detection signals during order completion
- **Tokenization**: Payment tokenization support for secure payment processing
- **Error Handling**: Comprehensive error responses following UCP specification

## Technical Overview

### Implementation Components

#### 1. Controller Layer
**File**: `cartridges/int_ucp/cartridge/controllers/RedirectURL.js`

The controller extends SFCC's base RedirectURL controller and routes incoming UCP requests to the appropriate middleware handlers. It intercepts:
- `/.well-known/ucp` (GET) - Discovery endpoint
- `/checkout-sessions` (POST) - Create session
- `/checkout-sessions/{session_id}` (GET, PUT) - Retrieve/Modify session
- `/checkout-sessions/{session_id}/complete` (POST) - Complete order

#### 2. Middleware Layer
**File**: `cartridges/int_ucp/cartridge/scripts/middleware/ucp.js`

Handles the business logic for each UCP endpoint:
- `handleUCPDiscoveryRequest()` - Returns UCP capabilities and payment handlers
- `handleCreateCheckoutSessionRequest()` - Creates a new checkout session
- `handleGetCheckoutSessionRequest()` - Retrieves an existing checkout session
- `handleModifyBasketRequest()` - Updates an existing checkout session
- `handleCompleteOrderRequest()` - Completes the checkout and creates an order

#### 3. Helper Layer
**File**: `cartridges/int_ucp/cartridge/scripts/helpers/ucpHelpers.js`

Provides utility functions for:
- Request validation and sanitization
- Basket management and line item updates
- Configuration management
- Buyer information handling
- Discount application
- Fulfillment option generation

#### 4. Custom Objects

- **UCPCheckoutSession**: Stores checkout session data including basket content, buyer information, and status
- **UCPTokenizer**: Stores tokenized payment data for secure payment processing

## API Endpoints

### Discovery Endpoint

#### `GET /.well-known/ucp`

Returns the UCP discovery document with supported capabilities and payment handlers.

**Response:** `200 OK`

```json
{
  "ucp": {
    "version": "2026-01-11",
    "services": {
      "checkout": {
        "base_url": "https://your-store.com"
      }
    },
    "capabilities": [
      "line_items",
      "discounts",
      "fulfillment",
      "payment"
    ]
  },
  "payment": {
    "handlers": [
      {
        "id": "credit_card",
        "type": "CREDIT_CARD",
        "name": "Credit Card",
        "supported_methods": ["visa", "mastercard", "amex"]
      }
    ]
  }
}
```

### Checkout Session Management

#### `POST /checkout-sessions`

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
    "email": "john@example.com",
    "consent": {
      "marketing": true
    }
  },
  "currency": "USD",
  "payment": {
    "handler_id": "credit_card"
  },
  "fulfillment": {
    "destination": {
      "address": {
        "line1": "123 Main St",
        "city": "San Francisco",
        "state": "CA",
        "postal_code": "94102",
        "country": "US"
      }
    }
  }
}
```

**Response:** `201 Created`

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "line_items": [...],
  "totals": {
    "subtotal": "100.00",
    "tax": "8.50",
    "shipping": "5.00",
    "total": "113.50",
    "currency": "USD"
  },
  "fulfillment": {
    "options": [...]
  }
}
```

#### `GET /checkout-sessions/{session_id}`

Retrieves an existing checkout session.

**Response:** `200 OK`

Returns the full checkout session object with current state.

#### `PUT /checkout-sessions/{session_id}`

Updates an existing checkout session. Can be used to:
- Add or remove line items
- Apply discount codes
- Update buyer information
- Select fulfillment options

**Request Body:** Similar to POST, with only the fields to update

**Response:** `200 OK`

Returns the updated checkout session.

#### `POST /checkout-sessions/{session_id}/complete`

Completes the checkout and creates an order.

**Request Body:**
```json
{
  "payment_data": {
    "handler_id": "credit_card",
    "credential": {
      "type": "token",
      "token": "payment_token_here"
    }
  },
  "risk_signals": {
    "ip": "192.168.1.1",
    "browser": "Mozilla/5.0..."
  }
}
```

**Response:** `200 OK`

```json
{
  "order": {
    "id": "00000001",
    "permalink": "https://your-store.com/orders/00000001",
    "status": "confirmed",
    "totals": {
      "subtotal": "100.00",
      "tax": "8.50",
      "shipping": "5.00",
      "total": "113.50",
      "currency": "USD"
    }
  }
}
```

## Configuration

### Site Preferences

The cartridge can be configured through SFCC Business Manager Site Preferences:

- **UCP Debug Mode**: Enable/disable debug logging
- **Payment Handlers**: Configure available payment handlers
- **Shipping Methods**: Configure available shipping methods and rates
- **Discount Rules**: Configure discount code validation rules

### Payment Handlers

The cartridge supports payment handlers as defined by the UCP specification. Currently supported:

- **Credit Card (CREDIT_CARD)**: Standard credit card payment processing

Additional payment handlers can be configured by implementing the UCP payment handler interface.

### Fulfillment Options

Shipping destinations and methods are dynamically generated based on:
- Store configuration in SFCC
- Destination address provided in the checkout session
- Available shipping methods for the destination

Supported shipping options include:
- Standard shipping
- Express shipping
- Free shipping (when applicable)

## Installation

### Prerequisites

- Salesforce Commerce Cloud instance (B2C Commerce)
- Access to Business Manager
- Developer access to upload cartridges
- Eclipse IDE with Salesforce Commerce Cloud plugin (for development)

### Installation Steps

1. **Download the Cartridge**
   - Download the latest release from the [GitHub repository](https://github.com/ForkPoint/ucp-sfcc)
   - Extract the cartridge files

2. **Upload to SFCC**
   - Upload the `int_ucp` cartridge to your SFCC instance
   - Ensure the cartridge is properly packaged

3. **Configure Cartridge Path**
   - In Business Manager, navigate to **Administration > Sites > Manage Sites > [Your Site]**
   - Add `int_ucp` to the cartridge path
   - Ensure proper cartridge ordering (int_ucp should come before storefront cartridges)

4. **Import Metadata**
   - Import site preference metadata: `metadata/meta/system.SitePreferences.ucp.xml`
   - Import custom object metadata: `metadata/meta/custom.UCPCheckoutSession.ucp.xml`
   - Import custom type metadata: `metadata/meta/custom.UCPTokenizer.ucp.xml`

5. **Configure Site Preferences**
   - Navigate to **Merchant Tools > Site Preferences > UCP Settings**
   - Configure payment handlers, shipping methods, and other settings

6. **Test the Integration**
   - Test the discovery endpoint: `GET https://your-store.com/.well-known/ucp`
   - Create a test checkout session
   - Complete a test order

### Verification

After installation, verify the cartridge is working:

1. **Discovery Endpoint Test**
   ```bash
   curl https://your-store.com/.well-known/ucp
   ```
   Should return a valid UCP discovery document.

2. **Check Logs**
   - Review SFCC logs for any errors
   - Enable debug mode in site preferences for detailed logging

## Use Cases

### E-commerce Platform Integration

Integrate your SFCC storefront with modern e-commerce platforms that support UCP, enabling:
- Unified checkout experience across platforms
- Consistent order management
- Standardized payment processing

### Headless Commerce

Use the UCP cartridge to power headless commerce implementations:
- Frontend applications can use UCP API directly
- No need for custom SFCC integration code
- Standardized protocol ensures compatibility

### Multi-channel Commerce

Enable consistent checkout experiences across multiple channels:
- Web storefronts
- Mobile applications
- Third-party marketplaces
- Social commerce platforms

## Limitations and Considerations

### Current Limitations

- **SFCC Version**: Requires Salesforce Commerce Cloud Platform SFRA 6.0 or later
- **Payment Handlers**: Additional payment handlers require custom implementation
- **Real-time Updates**: Session updates are synchronous (no webhook support)
- **Sites and Locales**: The cartridge is not aware of sites and locales. It will use the current site and locale.
- **Error Handling**: The cartridge returns generic error messages, instead of the specific error message from the UCP specification.


### Best Practices

- **Session Management**: Store session IDs securely and validate before use
- **Payment Security**: Never expose payment credentials in client-side code
- **Rate Limiting**: Implement rate limiting on the client side to prevent abuse
- **Testing**: Test thoroughly in sandbox before deploying to production

## Support and Resources

### Documentation

- **UCP Specification**: [https://ucp.dev/](https://ucp.dev/)
- **SFCC Documentation**: [Salesforce Commerce Cloud Developer Center](https://developer.salesforce.com/docs/commerce/commerce-api/overview)

### Getting Help

- **GitHub Repository**: [https://github.com/ForkPoint/ucp-sfcc](https://github.com/ForkPoint/ucp-sfcc)
- **Issues**: Report issues via the [GitHub issue tracker](https://github.com/ForkPoint/ucp-sfcc/issues)
- **Questions**: Contact support at ucp@forkpoint.com
- **Community**: Join the UCP community discussions

### Version Information

- **Latest Release**: Check repository for latest version
- **Compatibility**: Salesforce Commerce Cloud Platform SFRA 6.0+
- **License**: See LICENSE file in repository

---

## Related Documentation

- [UCP Specification](https://ucp.dev/)
- [SFCC Developer Documentation](https://developer.salesforce.com/docs/commerce/commerce-api/overview)
- [Cartridge Development Guide](https://developer.salesforce.com/docs/commerce/commerce-api/guide/cartridge-development.html)

