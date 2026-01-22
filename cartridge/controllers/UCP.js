'use strict';

const server = require('server');
server.extend(module.superModule);

const middleware = require('*/cartridge/scripts/middleware/ucp');

/**
 * https://ucp.dev/specification/examples/business-tokenizer-payment-handler
 * UCP Tokenization Flow:
 * ┌────────────┐                         ┌───────────────────────────────────┐
 * │  Platform  │                         │       Tokenizer / Processor       │
 * │ (Collector)│                         │      (Business or PSP)            │
 * └─────┬──────┘                         └─────────────────┬─────────────────┘
 *       │                                                  │
 *       │  1. GET payment.handlers                         │
 *       │─────────────────────────────────────────────────>│
 *       │                                                  │
 *       │  2. Handler Config (URL + Identity)              │
 *       │<─────────────────────────────────────────────────│
 *       │                                                  │
 *       │  3. POST /tokenize (Credential + Identity)       │
 *       │─────────────────────────────────────────────────>│
 *       │                                                  │
 *       │  4. Token                                        │
 *       │<─────────────────────────────────────────────────│
 *       │                                                  │
 *       │  5. POST checkout with TokenCredential           │
 *       │─────────────────────────────────────────────────>│
 *       │                                                  │
 *       │        (Internal Resolution: Token -> Info)      │
 *       │                                                  │
 *       │  6. Payment Result                               │
 *       │<─────────────────────────────────────────────────│
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 * @returns {void}
 */
server.post('Tokenize', middleware.handleTokenizeRequest);

module.exports = server.exports();
