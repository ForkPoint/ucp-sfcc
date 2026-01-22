'use strict';

const logger = require('dw/system/Logger').getLogger('UCP', 'UCP');

/**
 * Get shop configuration for UCP
 * @returns {Object} - Shop configuration
 */
function getShopConfig() {
  const Site = require('dw/system/Site');

  const config = Site.getCurrent().getCustomPreferenceValue('ucpShopConfig');

  if (config) {
    return JSON.parse(config);
  }

  return {
    debug: true,
    capabilities: [
      "checkout",
      "order",
      "discount",
      "fulfillment",
      "buyer_consent"
      // "refund", // Not supported
      // "return",
      // "dispute"
    ],
    encryptionKey: 'S3Cr3Tk3Y_2@26!'
  };
}

function getBuyerConsentLinks() {
  const URLUtils = require('dw/web/URLUtils');

  return [
    {
      "type": "terms_of_service",
      "url": URLUtils.https('Terms-Of-Service').toString()
    },
    {
      "type": "privacy_policy",
      "url": URLUtils.https('Privacy-Policy').toString()
    },
    {
      "type": "cookie_policy",
      "url": URLUtils.https('Cookie-Policy').toString()
    }
  ]
}

/**
 * Get capability object from capability name
 * @param {string} capability - Capability name
 * @returns {Object} - Capability object
 */
function getCapabilityFromMap(capability) {
  const map = {
    "checkout": {
      "name": "dev.ucp.shopping.checkout",
      "version": "2026-01-11",
      "spec": "https://ucp.dev/specs/shopping/checkout",
      "schema": "https://ucp.dev/schemas/shopping/checkout.json"
    },
    "order": {
      "name": "dev.ucp.shopping.order",
      "version": "2026-01-11",
      "spec": "https://ucp.dev/specs/shopping/order",
      "schema": "https://ucp.dev/schemas/shopping/order.json"
    },
    "refund": {
      "name": "dev.ucp.shopping.refund",
      "version": "2026-01-11",
      "spec": "https://ucp.dev/specs/shopping/refund",
      "schema": "https://ucp.dev/schemas/shopping/refund.json",
      "extends": "dev.ucp.shopping.order"
    },
    "return": {
      "name": "dev.ucp.shopping.return",
      "version": "2026-01-11",
      "spec": "https://ucp.dev/specs/shopping/return",
      "schema": "https://ucp.dev/schemas/shopping/return.json",
      "extends": "dev.ucp.shopping.order"
    },
    "dispute": {
      "name": "dev.ucp.shopping.dispute",
      "version": "2026-01-11",
      "spec": "https://ucp.dev/specs/shopping/dispute",
      "schema": "https://ucp.dev/schemas/shopping/dispute.json",
      "extends": "dev.ucp.shopping.order"
    },
    "discount": {
      "name": "dev.ucp.shopping.discount",
      "version": "2026-01-11",
      "spec": "https://ucp.dev/specs/shopping/discount",
      "schema": "https://ucp.dev/schemas/shopping/discount.json",
      "extends": "dev.ucp.shopping.checkout"
    },
    "fulfillment": {
      "name": "dev.ucp.shopping.fulfillment",
      "version": "2026-01-11",
      "spec": "https://ucp.dev/specs/shopping/fulfillment",
      "schema": "https://ucp.dev/schemas/shopping/fulfillment.json",
      "extends": "dev.ucp.shopping.checkout"
    },
    "buyer_consent": {
      "name": "dev.ucp.shopping.buyer_consent",
      "version": "2026-01-11",
      "spec": "https://ucp.dev/specs/shopping/buyer_consent",
      "schema": "https://ucp.dev/schemas/shopping/buyer_consent.json",
      "extends": "dev.ucp.shopping.checkout"
    }
  };

  return map[capability];
}

/**
 * Get external customer profile from buyer info
 * https://ucp.dev/specification/checkout/#transport-bindings
 * @param {{full_name?: string, email?: string, firstName?: string, lastName?: string, phone_number?: string}} buyer - Buyer information
 * @returns {dw.customer.ExternalProfile | null} - External customer profile
 */
function getExternalCustomerProfile(buyer) {
  const CustomerMgr = require('dw/customer/CustomerMgr');
  const Transaction = require('dw/system/Transaction');

  let email = buyer.email;
  let fullName = buyer.full_name || '';
  let firstName = buyer.firstName || fullName.split(' ')[0] || 'Guest';
  let lastName = buyer.lastName || fullName.split(' ')[1] || '';
  let customer = null;
  let profile = null;

  if (!email) return null;

  profile = CustomerMgr.searchProfile('email = {0}', email);

  // Regular Customer
  if (profile) {
    customer = profile.customer;
    let externalProfile = customer.getExternalProfile('ucp', email);

    // Create external profile if it doesn't exist
    if (!externalProfile) {
      Transaction.wrap(function () {
        externalProfile = customer.createExternalProfile('ucp', email);
        profile = customer.profile;

        if (!profile.firstName && firstName) {
          profile.setFirstName(firstName || fullName);
        }
        if (!profile.lastName && lastName) {
          profile.setLastName(lastName);
        }
      });
    }

    return externalProfile;
  }

  // Externally Authenticated Customer
  if (!profile) {
    profile = CustomerMgr.getExternallyAuthenticatedCustomerProfile('ucp', email);
  }

  // Create externally authenticated customer if it doesn't exist
  if (!profile) {
    Transaction.wrap(function () {
      customer = CustomerMgr.createExternallyAuthenticatedCustomer('ucp', email);
      profile = customer.profile;
      if (profile) {
        profile.setFirstName(lastName ? firstName : buyer.full_name);
        profile.setLastName(lastName ? lastName : '');
      }
    });
  }

  if (!profile) return null;

  return profile.customer.getExternalProfile('ucp', email);
}

/**
 * Send an error response to the client
 * @param {Object} res - Response object
 * @param {string} message - Error message
 * @param {number} statusCode - Status code
 */
function renderError(res, message, statusCode) {
  res.setStatusCode(statusCode);
  res.render('ucp/json', { jsonResponse: { error: true, message: message } });
}

/**
 * Send a JSON response to the client
 * @param {Object} res - Response object
 * @param {Object} data - Response data
 * @param {number} statusCode - Status code
 */
function renderJson(res, data, statusCode) {
  res.setStatusCode(statusCode);
  res.render('ucp/json', { jsonResponse: data });
}

/**
 * Get idempotency record from UCP checkout session custom object
 * @param {string} checkoutID - Checkout ID
 * @param {string} idempotencyKey - Idempotency key
 * @returns {Object|null} - Idempotency record or null
 */
function getIdempotencyRecord(checkoutID, idempotencyKey) {
  const CustomObjectMgr = require('dw/object/CustomObjectMgr');

  if (!checkoutID || !idempotencyKey) return null;

  try {
    var ucpSession = CustomObjectMgr.getCustomObject('UCPCheckoutSession', checkoutID);

    if (!ucpSession || !ucpSession.custom.ucpIdempotencyRecord) return null;

    var recordsJson = String(ucpSession.custom.ucpIdempotencyRecord);
    var records = JSON.parse(recordsJson);

    if (!records || typeof records !== 'object') return null;

    var record = records[idempotencyKey];
    if (!record) return null;

    return {
      key: idempotencyKey,
      requestHash: record.requestHash,
      status: record.status,
      responseBody: record.responseBody
    };
  } catch (e) {
    var errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('Error getting idempotency record: {0}', errorMessage);
    return null;
  }
}

/**
 * Save idempotency record to UCP checkout session custom object
 * @param {string} checkoutID - Checkout ID
 * @param {string} idempotencyKey - Idempotency key
 * @param {string} requestHash - Request hash
 * @param {string} responseBody - Response body (JSON string)
 * @param {number} status - HTTP status code
 */
function saveIdempotencyRecord(checkoutID, idempotencyKey, requestHash, responseBody, status) {
  const Transaction = require('dw/system/Transaction');
  const CustomObjectMgr = require('dw/object/CustomObjectMgr');
  let ucpSession = null;

  if (!checkoutID || !idempotencyKey) {
    logger.error('Cannot save idempotency record: checkoutID and idempotencyKey are required');
    return;
  }

  // Build idempotency record for this key
  const record = {
    requestHash: requestHash,
    status: status,
    responseBody: responseBody
  };

  Transaction.wrap(function () {
    ucpSession = CustomObjectMgr.getCustomObject('UCPCheckoutSession', checkoutID);

    // Create session if it doesn't exist
    if (!ucpSession) {
      ucpSession = CustomObjectMgr.createCustomObject('UCPCheckoutSession', checkoutID);
    }

    // Get existing records or initialize empty object
    var records = {};
    if (ucpSession.custom.ucpIdempotencyRecord) {
      try {
        records = JSON.parse(String(ucpSession.custom.ucpIdempotencyRecord));
        if (typeof records !== 'object' || Array.isArray(records)) {
          records = {};
        }
      } catch (e) {
        logger.warn('Failed to parse existing idempotency records, resetting');
        records = {};
      }
    }

    // Add/update the record for this idempotency key
    records[idempotencyKey] = record;

    // Save back to custom object
    ucpSession.custom.ucpIdempotencyRecord = JSON.stringify(records);
  });
}

/**
 * Subscribe/Unsubscribe user for marketing, analytics, preferences, and sale of data
 * @param {{ "analytics": boolean, "preferences": boolean, "marketing": boolean, "sale_of_data": boolean }} consent - Consent object
 */
function upsertSubscription(consent) {
  // TODO: Implement based on your project's requirements
}

/**
 * Validate request with idempotency check
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Object} requestBody - Request body
 * @returns {Object} - Validation result with error flag, customer, and optional cached response
 */
function validateRequest(req, res, requestBody) {
  const Site = require('dw/system/Site');
  const Transaction = require('dw/system/Transaction');
  const Currency = require('dw/util/Currency');
  const CustomerMgr = require('dw/customer/CustomerMgr');
  const URLRedirectMgr = require('dw/web/URLRedirectMgr');
  const CustomObjectMgr = require('dw/object/CustomObjectMgr');
  const path = URLRedirectMgr.getRedirectOrigin();

  // Get headers from request
  const ucpAgent = request.httpHeaders.get('ucp-agent');
  const match = path ? path.match(/checkout-sessions\/([a-f0-9-]{26,36})/) : null;
  let checkoutID = null;
  let agentProfile = null;
  let externalProfile = null;

  if (match && match.length > 1) checkoutID = match[1];
  const idempotencyValid = validateIdempotency(res, requestBody, checkoutID);
  if (idempotencyValid.error) {
    renderError(res, 'Idempotency key reused with different parameters', 409);
    return { error: true };
  }

  // Parse UCP agent profile if provided
  if (ucpAgent) {
    agentProfile = parseAgentProfile(ucpAgent);
  }

  if (requestBody.buyer && requestBody.buyer.consent) {
    upsertSubscription(requestBody.buyer.consent);
  }

  // Validate currency
  const currencyCode = requestBody.currency;
  const currentSite = Site.getCurrent();
  let customer;

  if (currentSite.allowedCurrencies.indexOf(currencyCode) === -1) {
    renderError(res, 'Currency not allowed', 400);
    return { error: true };
  }

  // TODO: Set proper locale based on currency..
  Transaction.wrap(function () {
    const currency = Currency.getCurrency(currencyCode);
    session.setCurrency(currency);
  });

  const ucpSession = checkoutID ? CustomObjectMgr.getCustomObject('UCPCheckoutSession', checkoutID) : null;

  // Validate buyer
  if (requestBody.buyer) {
    externalProfile = getExternalCustomerProfile(requestBody.buyer);
  } else if (ucpSession && ucpSession.custom.email) {
    // Get buyer from session email
    var buyer = {
      email: String(ucpSession.custom.email),
      full_name: String(ucpSession.custom.fullName),
      marketing_consent: JSON.parse(ucpSession.custom.marketingConsent || '{}')
    };
    externalProfile = getExternalCustomerProfile(buyer);
  }

  // Buyer property is not mandatory...
  if (!externalProfile) {
    return {
      error: false,
      customer: customer,
      agentProfile: agentProfile
    };
  }

  // Login customer
  Transaction.wrap(function () {
    customer = CustomerMgr.loginExternallyAuthenticatedCustomer(
      String(externalProfile.authenticationProviderID),
      String(externalProfile.externalID),
      false
    );
  });

  if (!customer) {
    renderError(res, 'Customer not found', 500);
    return { error: true };
  }

  return {
    error: false,
    customer: customer,
    agentProfile: agentProfile
  };
}

/**
 * Validate complete order request
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Object} requestBody - Request body
 * @returns {Object} - Validation result with error flag, customer, and ucp basket
 */
function validateCompleteOrderRequest(req, res, requestBody) {
  const URLRedirectMgr = require('dw/web/URLRedirectMgr');
  const CustomObjectMgr = require('dw/object/CustomObjectMgr');
  const Transaction = require('dw/system/Transaction');
  const CustomerMgr = require('dw/customer/CustomerMgr');

  const path = URLRedirectMgr.getRedirectOrigin();
  const matches = path ? path.match(/checkout-sessions\/([a-f0-9-]{26,36})\/complete/) : null;
  if (!matches || !matches[1]) {
    renderError(res, 'Session not found', 404);
    return { error: true };
  }

  const ucpSession = CustomObjectMgr.getCustomObject('UCPCheckoutSession', matches[1]);
  let customer = null;

  if (!ucpSession || !ucpSession.custom.email || !ucpSession.custom.basketContent) {
    renderError(res, 'Session not found', 404);
    return { error: true };
  }

  // Get buyer from session email
  const buyer = { email: String(ucpSession.custom.email), full_name: String(ucpSession.custom.fullName) };
  const externalProfile = getExternalCustomerProfile(buyer);

  if (!externalProfile) {
    renderError(res, 'Buyer not found', 400);
    return { error: true };
  }

  // Login customer
  Transaction.wrap(function () {
    customer = CustomerMgr.loginExternallyAuthenticatedCustomer(
      String(externalProfile.authenticationProviderID),
      String(externalProfile.externalID),
      false
    );
  });

  var riskSignals = requestBody.risk_signals || {};
  logger.info('Checkout Started: email: {0}, risk_signals: {1}', ucpSession.custom.email, JSON.stringify(riskSignals));

  return {
    error: false,
    customer: customer,
    ucpBasket: JSON.parse(ucpSession.custom.basketContent)
  };
}

/**
 * Validate idempotency of request
 * @param {Object} res - Response object
 * @param {Object} requestBody - Request body
 * @param {string | null} checkoutID - Checkout ID (optional, for idempotency check)
 * @returns {Object} - Validation result with error flag and optional cached record
 */
function validateIdempotency(res, requestBody, checkoutID) {
  const idempotencyKey = request.httpHeaders.get('idempotency-key');
  // Handle idempotency if key is provided and checkoutID exists
  if (idempotencyKey && checkoutID) {
    const requestHash = computeHash(requestBody);
    const cachedRecord = getIdempotencyRecord(checkoutID, idempotencyKey);

    if (cachedRecord) {
      // Check if request hash matches
      if (cachedRecord.requestHash !== requestHash) {
        renderError(res, 'Idempotency key reused with different parameters', 409);
        return { error: true };
      }
    }
  }

  return { error: false };
}

  /**
   * Compute SHA256 hash of data with sorted object keys
 * @param {*} data - Data to hash
 * @returns {string} - Hex encoded hash
 */
function computeHash(data) {
  const MessageDigest = require('dw/crypto/MessageDigest');
  const Encoding = require('dw/crypto/Encoding');

  // Replacer function to sort object keys
  var replacer = function (key, value) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      var sorted = {};
      var keys = Object.keys(value).sort();
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  };

  var jsonString = JSON.stringify(data, replacer);
  var digest = new MessageDigest(MessageDigest.DIGEST_SHA_256);
  var hash = digest.digestBytes(new dw.util.Bytes(jsonString, 'UTF-8'));

  return Encoding.toHex(hash);
}

/**
 * Encode/encrypt a token using AES encryption
 * @param {string} token - The token to encrypt
 * @returns {string} - Base64 encoded encrypted token
 */
function encodeToken(token) {
  const Cipher = require('dw/crypto/Cipher');
  const Encoding = require('dw/crypto/Encoding');
  const Bytes = require('dw/util/Bytes');

  const encryptionKey = getShopConfig().encryptionKey;

  if (!token) {
    return '';
  }

  try {
    // Get encryption key from site preferences or use site ID as fallback

    // Ensure key is 16, 24, or 32 bytes for AES
    // Pad or truncate the key to 32 bytes (256-bit AES)
    var keyString = encryptionKey.toString();
    while (keyString.length < 32) {
      keyString += keyString;
    }
    keyString = keyString.substring(0, 32);

    // Create cipher with AES/CBC/PKCS5Padding
    var cipher = new Cipher();

    // Encrypt the token - encrypt expects strings, not Bytes
    var encryptedString = cipher.encrypt(token, keyString, 'AES/CBC/PKCS5Padding', null, 0);

    // Encode to Base64 for safe transport
    var encryptedBytes = new Bytes(encryptedString, 'UTF-8');
    return Encoding.toBase64(encryptedBytes);
  } catch (e) {
    var errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('Error encoding token: {0}', errorMessage);
    return '';
  }
}

/**
 * Decode/decrypt a token using AES decryption
 * @param {string} encodedToken - The Base64 encoded encrypted token
 * @returns {string} - Decrypted token
 */
function decodeToken(encodedToken) {
  const Cipher = require('dw/crypto/Cipher');
  const Encoding = require('dw/crypto/Encoding');
  const Bytes = require('dw/util/Bytes');

  if (!encodedToken) {
    return '';
  }

  const encryptionKey = getShopConfig().encryptionKey;

  try {
    // Pad or truncate encryption key to 32 bytes (as in encodeToken)
    var keyString = encryptionKey.toString();
    while (keyString.length < 32) {
      keyString += keyString;
    }
    keyString = keyString.substring(0, 32);

    // Base64 decode the input to get bytes (reverse of Encoding.toBase64)
    var encryptedBytes = Encoding.fromBase64(encodedToken);

    // Convert bytes to string (in encode, we went from string to Bytes with UTF-8)
    var encryptedString = encryptedBytes instanceof Bytes ? encryptedBytes.toString('UTF-8') : String(encryptedBytes);

    // Decrypt the string, using same params as encodeToken
    var cipher = new Cipher();
    var decryptedString = cipher.decrypt(encryptedString, keyString, 'AES/CBC/PKCS5Padding', null, 0);

    return decryptedString;
  } catch (e) {
    var errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('Error decoding token: {0}', errorMessage);
    return '';
  }
}

/**
 * Parse UCP agent header to extract webhook URL from profile
 * @param {string} ucpAgentHeader - UCP-Agent header value
 * @returns {Object|null} - Object with webhook_url property or null
 */
function parseAgentProfile(ucpAgentHeader) {
  const HTTPClient = require('dw/net/HTTPClient');
  const Encoding = require('dw/crypto/Encoding');

  if (!ucpAgentHeader) return null;

  // Extract profile URI from header
  var match = ucpAgentHeader.match(/profile="([^"]+)"/);
  if (!match) return null;

  var profileUri = match[1];
  var profileData = null;

  try {
    // Handle data: URI
    if (profileUri.indexOf('data:') === 0) {
      var parts = profileUri.split(',');
      if (parts.length > 1) {
        var base64Data = parts[1];
        var jsonStr = Encoding.fromBase64(base64Data).toString('UTF-8');
        profileData = JSON.parse(jsonStr);
      }
    }
    // Handle HTTP/HTTPS URI
    else if (profileUri.indexOf('http') === 0) {
      var httpClient = new HTTPClient();
      httpClient.setTimeout(5000); // 5 second timeout
      httpClient.open('GET', profileUri);
      httpClient.send();

      if (httpClient.statusCode === 200) {
        profileData = JSON.parse(httpClient.text);
      }
    }

    // Extract webhook_url from capabilities
    if (profileData && profileData.ucp && profileData.ucp.capabilities) {
      var capabilities = profileData.ucp.capabilities;
      for (var i = 0; i < capabilities.length; i++) {
        var capability = capabilities[i];
        if (capability.name === 'dev.ucp.shopping.order' &&
          capability.config &&
          capability.config.webhook_url) {
          return { webhook_url: capability.config.webhook_url };
        }
      }
    }
  } catch (e) {
    var errorMessage = e instanceof Error ? e.message : String(e);
    logger.warn('Failed to fetch or parse agent profile: {0}', errorMessage);
  }

  return null;
}


/**
 * Update line items in basket based on UCP request
 * @param {dw.order.Basket} basket - The basket to update
 * @param {Array} lineItems - Array of line item updates from UCP request
 * @param {Object} req - Request object
 */
function updateLineItems(basket, lineItems, req) {
  const ProductMgr = require('dw/catalog/ProductMgr');
  const Transaction = require('dw/system/Transaction');
  const cartHelpers = require('app_storefront_base/cartridge/scripts/cart/cartHelpers');

  lineItems.forEach(function (lineItemData) {
    let product = ProductMgr.getProduct(lineItemData.item.id);
    if (product) {
      Transaction.wrap(function () {
        cartHelpers.addProductToCart(basket, product.ID, lineItemData.quantity, [], []);
      });
    }
  });
}

/**
 * Apply discount codes to basket
 * @param {dw.order.Basket} basket - The basket to update
 * @param {Array} codes - Array of coupon codes to apply
 */
function applyDiscountCodes(basket, codes) {
  const Transaction = require('dw/system/Transaction');

  Transaction.wrap(function () {
    // Apply new coupon codes
    codes.forEach(function (code) {
        try {
          basket.createCouponLineItem(code, true);
        } catch (e) {
          var errorMessage = e instanceof Error ? e.message : String(e);
          logger.warn('Failed to apply coupon code {0}: {1}', code, errorMessage);
        }
    });
  });
}

/**
 * Assign IDs to agent-provided destinations
 * @param {Array} destinations - Array of destination objects from UCP request
 * @returns {Array} - Array of destinations with assigned IDs
 */
function assignDestinationIds(destinations) {
  if (!destinations || destinations.length === 0) return [];

  return destinations.map(function (dest, index) {
    // If destination already has an ID, keep it
    if (dest.id) return dest;

    // Assign a new ID based on address type or index
    var idPrefix = 'dest';
    if (dest.street_address) {
      // Try to create a meaningful ID
      if (dest.street_address.toLowerCase().indexOf('main') !== -1) {
        idPrefix = 'dest_home';
      } else if (dest.street_address.toLowerCase().indexOf('work') !== -1 ||
                 dest.street_address.toLowerCase().indexOf('office') !== -1) {
        idPrefix = 'dest_work';
      } else {
        idPrefix = 'dest_' + (index + 1);
      }
    }

    return Object.assign({}, dest, { id: idPrefix });
  });
}

/**
 * Get customer's saved addresses from address book
 * @param {dw.customer.Customer} customer - The customer
 * @returns {Array} - Array of destination objects from customer's address book
 */
function getCustomerAddressBookDestinations(customer) {
  const collections = require('*/cartridge/scripts/util/collections');
  const destinations = [];

  if (!customer || !customer.profile || !customer.profile.addressBook) {
    return destinations;
  }

  const addressBook = customer.profile.addressBook;
  const addresses = addressBook.addresses;

  collections.forEach(addresses, function (address) {
    destinations.push({
      id: address.ID || address.UUID,
      street_address: address.address1 || '',
      city: address.city || '',
      region: address.stateCode || '',
      postal_code: address.postalCode || '',
      address_country: address.countryCode ? address.countryCode.value : 'US',
      first_name: address.firstName || '',
      last_name: address.lastName || '',
      phone_number: address.phone || ''
    });
  });

  return destinations;
}

/**
 * Get fulfillment addresses from all stores
 * Returns store addresses that can be used as fulfillment destinations
 * (for in-store pickup, ship-from-store, etc.)
 * @returns {Array} - Array of destination objects from stores
 */
function getFulfillmentAddresses() {
  const SystemObjectMgr = require('dw/object/SystemObjectMgr');
  const destinations = [];

  try {
    // Query all stores
    const stores = SystemObjectMgr.querySystemObjects('Store', '', 'name ASC');

    while (stores.hasNext()) {
      const store = stores.next();

      // Only include stores that have addresses
      if (store.address1 || store.city || store.postalCode) {
        destinations.push({
          id: store.ID,
          street_address: store.address1 || '',
          city: store.city || '',
          region: store.stateCode || '',
          postal_code: store.postalCode || '',
          address_country: store.countryCode ? store.countryCode.value : 'US',
          // Store name can be useful for identification
          name: store.name || store.ID
        });
      }
    }

    stores.close();
  } catch (e) {
    var errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('Error getting fulfillment addresses from stores: {0}', errorMessage);
  }

  return destinations;
}

/**
 * Apply destination address to shipment
 * @param {dw.order.Shipment} shipment - The shipment to update
 * @param {Object} destination - Destination object with address fields
 */
function applyDestinationToShipment(shipment, destination) {
  const Transaction = require('dw/system/Transaction');

  if (!shipment || !destination) return;

  Transaction.wrap(function () {
    if (!shipment.shippingAddress) {
      shipment.createShippingAddress();
    }

    const shippingAddress = shipment.shippingAddress;
    if (shippingAddress) {
      shippingAddress.setAddress1(destination.street_address || '');
      shippingAddress.setCity(destination.city || destination.address_locality || '');
      shippingAddress.setStateCode(destination.region || destination.address_region || '');
      shippingAddress.setPostalCode(destination.postal_code || '');
      shippingAddress.setCountryCode(destination.address_country || 'US');

      if (destination.first_name) {
        shippingAddress.setFirstName(destination.first_name);
      }
      if (destination.last_name) {
        shippingAddress.setLastName(destination.last_name);
      }
      if (destination.phone_number) {
        shippingAddress.setPhone(destination.phone_number);
      }
    }
  });
}

/**
 * Update fulfillment (shipping) information
 * @param {dw.order.Basket} basket - The basket to update
 * @param {Object} fulfillment - Fulfillment object from UCP request
 */
function updateFulfillment(basket, fulfillment) {
  const Transaction = require('dw/system/Transaction');
  const ShippingMgr = require('dw/order/ShippingMgr');

  const methods = fulfillment.methods;

  if (!methods || methods.length === 0) return;

  methods.forEach(function (method) {
    if (method.type === 'shipping') {
      const shipment = basket.defaultShipment;

      // Handle destination - agent provides destinations in request
      if ((method.destinations && method.destinations.length > 0) || !!method.selected_destination_id) {
        // Assign IDs to destinations for use in response
        const destinationsWithIds = assignDestinationIds(method.destinations);

        // Determine which destination to apply to the shipment
        let destinationToApply = null;

        if (method.selected_destination_id) {
          // Find the selected destination from the provided list
          destinationToApply = destinationsWithIds.find(function (dest) {
            return dest.id === method.selected_destination_id;
          });
        } else {
          // Auto-select first destination when destinations are provided but none selected
          destinationToApply = destinationsWithIds[0];
        }

        if (destinationToApply) {
          applyDestinationToShipment(shipment, destinationToApply);

          Transaction.wrap(function () {
            basket.custom.ucpSelectedDestinationId = destinationToApply.id;
          });
        }
      }

      // Update shipping method if option is selected
      if (method.groups && method.groups.length > 0) {
        method.groups.forEach(function (group) {
          if (group.selected_option_id) {
            Transaction.wrap(function () {
              const allMethods = ShippingMgr.getAllShippingMethods();
              let shippingMethod = null;

              const methodsIterator = allMethods.iterator();
              while (methodsIterator.hasNext()) {
                const methodItem = methodsIterator.next();
                if (methodItem.ID === group.selected_option_id) {
                  shippingMethod = methodItem;
                  break;
                }
              }

              if (shippingMethod) {
                shipment.setShippingMethod(shippingMethod);
                basket.custom.ucpSelectedShippingMethodId = group.selected_option_id;
              }
            });
          }
        });
      }
    }
  });
}

/**
 * Update buyer information in basket
 * @param {dw.order.Basket} basket - The basket to update
 * @param {Object} buyer - Buyer information from UCP request
 */
function updateBuyerInfo(basket, buyer) {
  const Transaction = require('dw/system/Transaction');

  Transaction.wrap(function () {
    if (buyer.email) {
      basket.setCustomerEmail(buyer.email);
    }

    // Update billing address if not already set
    if (!basket.billingAddress) {
      basket.createBillingAddress();
    }

    const billingAddress = basket.billingAddress;

    if (billingAddress) {
      const nameParts = buyer.full_name ? buyer.full_name.split(' ') : [];
      const firstName = buyer.first_name || nameParts[0] || 'Guest';
      const lastName = buyer.last_name || nameParts.slice(1).join(' ') || '';

      billingAddress.setFirstName(firstName);
      billingAddress.setLastName(lastName);

      if (buyer.phone_number) {
        billingAddress.setPhone(buyer.phone_number);
      }
    }
  });
}

/**
 * Process payment instrument from UCP payment data
 * @param {dw.order.Basket} basket - The basket to update
 * @param {Object} paymentData - Payment data from UCP complete request
 */
function processPaymentInstrument(basket, paymentData) {
  const Transaction = require('dw/system/Transaction');
  const URLRedirectMgr = require('dw/web/URLRedirectMgr');
  const CustomObjectMgr = require('dw/object/CustomObjectMgr');
  const collections = require('*/cartridge/scripts/util/collections');
  const ucpHelpers = require('*/cartridge/scripts/helpers/ucpHelpers');

  // Determine payment method based on handler
  const paymentMethodID = paymentData.handler_id;
  let credential = paymentData.credential;

  const isValidCard = !!credential.number && !!credential.expiry_month
    && !!credential.expiry_year && !!credential.cvc;

  if (!isValidCard) {
    const isTokenized = !!credential.token;
    const ucpTokenizer = CustomObjectMgr.getCustomObject('UCPTokenizer', credential.token);

    if (!isTokenized || !ucpTokenizer) {
      throw new Error('Credential token is not valid');
    }

    const decodedData = ucpHelpers.decodeToken(ucpTokenizer.custom.data);

    credential = JSON.parse(decodedData || '{}');
    if (!credential || !credential.number || !credential.expiry_month || !credential.expiry_year) {
      throw new Error('Credential is not valid');
    }

    if (credential.binding && credential.binding.checkout_id) {
      const path = URLRedirectMgr.getRedirectOrigin();
      const matches = path ? path.match(/checkout-sessions\/([a-f0-9-]{26,36})\/complete/) : null;
      if (!matches || !matches[1] || matches[1] !== credential.binding.checkout_id) {
        throw new Error('Checkout session not found or invalid');
      }
    }
  }

  Transaction.wrap(function () {
    // Remove existing payment instruments
    collections.forEach(basket.paymentInstruments, function (pi) {
      basket.removePaymentInstrument(pi);
    });

    // Create payment instrument
    const paymentInstrument = basket.createPaymentInstrument(
      paymentMethodID,
      basket.totalGrossPrice
    );

    // Store payment details
    if (credential.type === 'card') {
      paymentInstrument.setCreditCardNumber(credential.number);
      paymentInstrument.setCreditCardExpirationMonth(credential.expiry_month);
      paymentInstrument.setCreditCardExpirationYear(credential.expiry_year);
      paymentInstrument.setCreditCardIssueNumber(credential.cvc);
      paymentInstrument.setCreditCardType(paymentData.brand);
      // paymentInstrument.setCreditCardHolder();
    }

    // Update billing address from payment data
    if (paymentData.billing_address) {
      if (!basket.billingAddress) {
        basket.createBillingAddress();
      }

      const billingAddress = basket.billingAddress;
      const addr = paymentData.billing_address;

      if (billingAddress) {
        billingAddress.setAddress1(addr.street_address || '');
        billingAddress.setCity(addr.address_locality || '');
        billingAddress.setStateCode(addr.address_region || '');
        billingAddress.setPostalCode(addr.postal_code || '');
        billingAddress.setCountryCode(addr.address_country || 'US');
      }
    }
  });
}

/**
 * Send webhook notification to platform
 * @param {string} webhookUrl - Webhook URL from agent profile
 * @param {Object} payload - Payload to send
 */
function sendWebhookNotification(webhookUrl, payload) {
  const HTTPClient = require('dw/net/HTTPClient');

  try {
    const httpClient = new HTTPClient();
    httpClient.setTimeout(5000);
    httpClient.open('POST', webhookUrl);
    httpClient.setRequestHeader('Content-Type', 'application/json');
    httpClient.send(JSON.stringify(payload));

    if (httpClient.statusCode >= 200 && httpClient.statusCode < 300) {
      logger.info('Webhook notification sent successfully to {0}', webhookUrl);
    } else {
      logger.warn('Webhook notification failed with status {0}', httpClient.statusCode);
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('Failed to send webhook notification: {0}', errorMessage);
  }
}

/**
 * Ensures that no shipment exists with 0 product line items
 * Base SFRA function with the ability to pass in the basket to update
 * @param {Object} req - the request object needed to access session.privacyCache
 * @param {dw.order.Basket} currentBasket - The basket to update
 */
function ensureNoEmptyShipments(req, currentBasket) {
  const Transaction = require('dw/system/Transaction');
  const collections = require('*/cartridge/scripts/util/collections');
  const checkoutHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
  const AddressModel = require('*/cartridge/models/address');

  Transaction.wrap(function () {
    var iter = currentBasket.shipments.iterator();
    var shipment;
    var shipmentsToDelete = [];

    while (iter.hasNext()) {
      shipment = iter.next();
      if (shipment.productLineItems.length < 1 && shipmentsToDelete.indexOf(shipment) < 0) {
        if (shipment.default) {
          // Cant delete the defaultShipment
          // Copy all line items from 2nd to first
          var altShipment = checkoutHelpers.getFirstNonDefaultShipmentWithProductLineItems(currentBasket);
          if (!altShipment) return;

          // Move the valid marker with the shipment
          var altValid = req.session.privacyCache.get(altShipment.UUID);
          req.session.privacyCache.set(currentBasket.defaultShipment.UUID, altValid);

          collections.forEach(altShipment.productLineItems,
            function (lineItem) {
              lineItem.setShipment(currentBasket.defaultShipment);
            });

          if (altShipment.shippingAddress) {
            // Copy from other address
            var addressModel = new AddressModel(altShipment.shippingAddress);
            checkoutHelpers.copyShippingAddressToShipment(addressModel, currentBasket.defaultShipment);
          } else {
            // Or clear it out
            currentBasket.defaultShipment.createShippingAddress();
          }

          if (altShipment.custom && altShipment.custom.fromStoreId && altShipment.custom.shipmentType) {
            currentBasket.defaultShipment.custom.fromStoreId = altShipment.custom.fromStoreId;
            currentBasket.defaultShipment.custom.shipmentType = altShipment.custom.shipmentType;
          }

          currentBasket.defaultShipment.setShippingMethod(altShipment.shippingMethod);
          // then delete 2nd one
          shipmentsToDelete.push(altShipment);
        } else {
          shipmentsToDelete.push(shipment);
        }
      }
    }

    for (var j = 0, jj = shipmentsToDelete.length; j < jj; j++) {
      currentBasket.removeShipment(shipmentsToDelete[j]);
    }
  });
}

/**
 * Populate cart with UCP JSON structure
 * @param {dw.order.Basket} basket - The basket to populate with UCP data
 * @param {Object} ucpBasket - UCP basket object
 */
function populateBasketFromUCPBasket(basket, ucpBasket) {
  const BasketMgr = require('dw/order/BasketMgr');
  const Transaction = require('dw/system/Transaction');
  const ProductMgr = require('dw/catalog/ProductMgr');
  const cartHelpers = require('app_storefront_base/cartridge/scripts/cart/cartHelpers');

  if (!basket) {
    logger.error('Cannot populate cart: basket is null or undefined');
    return;
  }

  if (!ucpBasket) {
    logger.error('Cannot populate cart: ucpJson is null or undefined');
    return;
  }

  Transaction.wrap(function () {
    // Set currency
    if (ucpBasket.currency) {
      var Currency = require('dw/util/Currency');
      var currency = Currency.getCurrency(ucpBasket.currency);
      if (currency) {
        session.setCurrency(currency);
        basket.updateCurrency();
      }
    }

    // Fail-safe against SFRA base.getBasket() returning null
    BasketMgr.getCurrentOrNewBasket();

    // Add line items from UCP JSON
    if (ucpBasket.line_items && ucpBasket.line_items.length > 0) {
      ucpBasket.line_items.forEach(function (ucpLineItem) {
        if (ucpLineItem.item && ucpLineItem.item.id) {
          var product = ProductMgr.getProduct(ucpLineItem.item.id);
          if (product) {
            var quantity = ucpLineItem.quantity || 1;
            cartHelpers.addProductToCart(basket, product.ID, quantity, [], []);
          } else {
            logger.warn('Product not found: {0}', ucpLineItem.item.id);
          }
        }
      });
    }

    // Set buyer information
    if (ucpBasket.buyer) {
      if (ucpBasket.buyer.email) {
        basket.setCustomerEmail(ucpBasket.buyer.email);
      }

      // Create or update billing address
      if (!basket.billingAddress) {
        basket.createBillingAddress();
      }

      var billingAddress = basket.billingAddress;
      if (billingAddress && ucpBasket.buyer.full_name) {
        var nameParts = ucpBasket.buyer.full_name.split(' ');
        var firstName = nameParts[0] || 'Guest';
        var lastName = nameParts.slice(1).join(' ') || '';

        billingAddress.setFirstName(firstName);
        billingAddress.setLastName(lastName);
      }

      if (billingAddress && ucpBasket.buyer.phone_number) {
        billingAddress.setPhone(ucpBasket.buyer.phone_number);
      }
    }

    // Apply discount codes
    if (ucpBasket.discounts && ucpBasket.discounts.codes && ucpBasket.discounts.codes.length > 0) {
      // Apply new coupon codes
      ucpBasket.discounts.codes.forEach(function (code) {
        try {
          basket.createCouponLineItem(code, true);
        } catch (e) {
          var errorMessage = e instanceof Error ? e.message : String(e);
          logger.warn('Failed to apply coupon code {0}: {1}', code, errorMessage);
        }
      });
    }

    // Handle fulfillment (shipping)
    if (ucpBasket.fulfillment && ucpBasket.fulfillment.methods && ucpBasket.fulfillment.methods.length > 0) {
      ucpBasket.fulfillment.methods.forEach(function (method) {
        if (method.type === 'shipping') {
          var shipment = basket.defaultShipment;

          // Set shipping address if destination is selected
          if (method.selected_destination_id && method.destinations) {
            var selectedDestination = method.destinations.find(function (dest) {
              return dest.id === method.selected_destination_id;
            });

            if (selectedDestination) {
              if (!shipment.shippingAddress) {
                shipment.createShippingAddress();
              }

              var shippingAddress = shipment.shippingAddress;
              if (shippingAddress) {
                if (selectedDestination.street_address) {
                  shippingAddress.setAddress1(selectedDestination.street_address);
                }
                if (selectedDestination.city || selectedDestination.address_locality) {
                  shippingAddress.setCity(selectedDestination.city || selectedDestination.address_locality);
                }
                if (selectedDestination.region || selectedDestination.address_region) {
                  shippingAddress.setStateCode(selectedDestination.region || selectedDestination.address_region);
                }
                if (selectedDestination.postal_code) {
                  shippingAddress.setPostalCode(selectedDestination.postal_code);
                }
                if (selectedDestination.address_country) {
                  shippingAddress.setCountryCode(selectedDestination.address_country);
                }
                if (selectedDestination.first_name) {
                  shippingAddress.setFirstName(selectedDestination.first_name);
                }
                if (selectedDestination.last_name) {
                  shippingAddress.setLastName(selectedDestination.last_name);
                }
                if (selectedDestination.phone_number) {
                  shippingAddress.setPhone(selectedDestination.phone_number);
                }
              }
            }
          }

          // Set shipping method if option is selected
          if (method.groups && method.groups.length > 0) {
            method.groups.forEach(function (group) {
              if (group.selected_option_id) {
                var ShippingMgr = require('dw/order/ShippingMgr');
                var allMethods = ShippingMgr.getAllShippingMethods();
                var shippingMethod = null;

                var methodsIterator = allMethods.iterator();
                while (methodsIterator.hasNext()) {
                  var methodItem = methodsIterator.next();
                  if (methodItem.ID === group.selected_option_id) {
                    shippingMethod = methodItem;
                    break;
                  }
                }

                if (shippingMethod) {
                  shipment.setShippingMethod(shippingMethod);
                } else {
                  logger.warn('Shipping method not found: {0}', group.selected_option_id);
                }
              }
            });
          }
        }
      });
    }
  });

  logger.info('Cart populated with UCP JSON structure');
}

module.exports = {
  getShopConfig: getShopConfig,
  getBuyerConsentLinks: getBuyerConsentLinks,
  getCapabilityFromMap: getCapabilityFromMap,
  getExternalCustomerProfile: getExternalCustomerProfile,
  renderError: renderError,
  renderJson: renderJson,
  validateRequest: validateRequest,
  validateCompleteOrderRequest: validateCompleteOrderRequest,
  computeHash: computeHash,
  encodeToken: encodeToken,
  decodeToken: decodeToken,
  parseAgentProfile: parseAgentProfile,
  getIdempotencyRecord: getIdempotencyRecord,
  saveIdempotencyRecord: saveIdempotencyRecord,
  validateIdempotency: validateIdempotency,
  updateLineItems: updateLineItems,
  applyDiscountCodes: applyDiscountCodes,
  updateFulfillment: updateFulfillment,
  updateBuyerInfo: updateBuyerInfo,
  processPaymentInstrument: processPaymentInstrument,
  sendWebhookNotification: sendWebhookNotification,
  ensureNoEmptyShipments: ensureNoEmptyShipments,
  populateBasketFromUCPBasket: populateBasketFromUCPBasket,
  assignDestinationIds: assignDestinationIds,
  getCustomerAddressBookDestinations: getCustomerAddressBookDestinations,
  getFulfillmentAddresses: getFulfillmentAddresses,
  applyDestinationToShipment: applyDestinationToShipment
};
