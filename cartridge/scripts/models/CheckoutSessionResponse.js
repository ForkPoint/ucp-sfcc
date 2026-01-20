'use strict';

/* API Includes */
const URLUtils = require('dw/web/URLUtils');
const collections = require('*/cartridge/scripts/util/collections');
const UUIDUtils = require('dw/util/UUIDUtils');
const Order = require('dw/order/Order');
const ShippingMgr = require('dw/order/ShippingMgr');

/**
 * Convert money value to cents (integer)
 * @param {dw.value.Money} money - Money object
 * @returns {number} - Amount in cents
 */
function moneyToCents(money) {
  if (!money) return 0;
  return Math.round(money.value * 100);
}

/**
 * Get line item totals
 * @param {dw.order.ProductLineItem} lineItem - Product line item
 * @returns {Array} - Array of total objects
 */
function getLineItemTotals(lineItem) {
  const subtotal = moneyToCents(lineItem.basePrice);
  const total = moneyToCents(lineItem.basePrice);

  return [
    {
      type: 'subtotal',
      amount: subtotal
    },
    {
      type: 'total',
      amount: total
    }
  ];
}

/**
 * Map product line items to UCP line items
 * @param {dw.order.LineItemCtnr} lineItemContainer - SFCC basket or order
 * @returns {Array} - Array of UCP line items
 */
function mapLineItems(lineItemContainer) {
  var lineItems = [];

  collections.forEach(lineItemContainer.productLineItems, function (pli) {
    lineItems.push({
      id: pli.UUID,
      item: {
        id: pli.productID,
        title: pli.productName,
        price: moneyToCents(pli.basePrice)
      },
      quantity: pli.quantityValue,
      totals: getLineItemTotals(pli)
    });
  });

  return lineItems;
}

/**
 * Get buyer information from basket
 * @param {Object} buyer - Buyer data from the request (optional)
 * @param {dw.order.LineItemCtnr} lineItemContainer - SFCC basket or order
 * @returns {Object} - Buyer object
 */
function getBuyerInfo(buyer, lineItemContainer) {
  const billingAddress = buyer.full_name || lineItemContainer.billingAddress;
  const customerEmail = buyer.email || lineItemContainer.customerEmail;
  const marketingConsent = buyer.consent || {};
  let fullName = '';

  if (billingAddress) {
    fullName = (billingAddress.firstName || '') + ' ' + (billingAddress.lastName || '');
    fullName = fullName.trim();
  }

  const split = fullName.split(' ');
  const firstName = split[0] || '';
  const lastName = split.length > 1 ? split[1] : '';

  return {
    full_name: fullName || 'Guest',
    first_name: firstName,
    last_name: lastName,
    email: customerEmail || '',
    consent: marketingConsent
  };
}

/**
 * Get basket totals
 * @param {dw.order.LineItemCtnr} lineItemContainer - SFCC basket or order
 * @param {boolean} requestedFulfillment - Whether fulfillment was requested in the request
 * @returns {Array} - Array of total objects
 */
function getBasketTotals(lineItemContainer, requestedFulfillment) {
  const totals = [];
  const subtotal = moneyToCents(lineItemContainer.merchandizeTotalNetPrice);
  const fulfillment = moneyToCents(lineItemContainer.shippingTotalNetPrice);
  const discount = moneyToCents(lineItemContainer.merchandizeTotalPrice.subtract(lineItemContainer.adjustedMerchandizeTotalPrice));
  const tax = moneyToCents(lineItemContainer.totalTax);

  let total;

  if (requestedFulfillment) {
    total = moneyToCents(lineItemContainer.totalGrossPrice);
  } else {
    total = moneyToCents(lineItemContainer.adjustedMerchandizeTotalPrice);
  }

  // Always include subtotal
  totals.push({
    type: 'subtotal',
    amount: subtotal
  });

  // Only include fulfillment if > 0 or if a shipping method is selected
  if (requestedFulfillment && (fulfillment > 0 || (lineItemContainer.defaultShipment && lineItemContainer.defaultShipment.shippingMethod) )) {
    totals.push({
      type: 'fulfillment',
      amount: fulfillment
    });
  }

  // Only include discount if > 0
  if (discount > 0) {
    totals.push({
      type: 'discount',
      amount: discount
    });
  }

  totals.push({
    type: 'tax',
    amount: tax
  })

  // Always include total
  totals.push({
    type: 'total',
    amount: total
  });

  return totals;
}

/**
 * Get discount information
 * @param {dw.order.LineItemCtnr} lineItemContainer - SFCC basket or order
 * @returns {Object} - Discounts object
 */
function getDiscounts(lineItemContainer) {
  const Money = require('dw/value/Money');
  const codes = [];
  const applied = [];

  collections.forEach(lineItemContainer.couponLineItems, function (couponLineItem) {
    if (couponLineItem.valid) {
      let codeAmount = couponLineItem.priceAdjustments.toArray().reduce(function (acc, priceAdjustment) {
        return acc.add(priceAdjustment.price);
      }, new Money(0, lineItemContainer.currencyCode));

      // Convert to positive value
      codeAmount = codeAmount.multiply(-1);

      codes.push(couponLineItem.couponCode);
      applied.push({
        code: couponLineItem.couponCode,
        title: couponLineItem.couponCode,
        amount: moneyToCents(codeAmount),
        automatic: true,
        allocations: [
          {
            path: "$.totals[?(@.type=='subtotal')]",
            amount: moneyToCents(codeAmount)
          }
        ]
      });
    }
  });

  collections.forEach(lineItemContainer.priceAdjustments, function (priceAdjustment) {
    if (priceAdjustment.basedOnCoupon) return;

    var promotion = priceAdjustment.promotion;
    var amount = Math.abs(moneyToCents(priceAdjustment.price));

    applied.push({
      code: promotion.ID,
      title: promotion ? promotion.name : priceAdjustment.lineItemText,
      amount: amount,
      automatic: !priceAdjustment.basedOnCoupon,
      allocations: [
        {
          path: "$.totals[?(@.type=='subtotal')]",
          amount: amount
        }
      ]
    });
  });

  return {
    codes: codes,
    applied: applied
  };
}

/**
 * Get available destinations from basket addresses (shipping and billing)
 * @param {dw.order.LineItemCtnr} lineItemContainer - SFCC basket or order
 * @param {dw.order.Shipment} shipment - Current shipment
 * @returns {Array} - Array of destination objects
 */
function getDestinations(lineItemContainer, shipment) {
  var destinations = [];
  var addedAddresses = {};

  /**
   * Helper to create address key for duplicate detection
   */
  function getAddressKey(addr) {
    return (addr.address1 || '') + '|' + (addr.postalCode || '') + '|' + (addr.countryCode ? addr.countryCode.value : '');
  }

  /**
   * Helper to add address to destinations if not duplicate
   */
  function addAddressIfUnique(address, idPrefix) {
    if (!address || !address.address1) return;

    var key = getAddressKey(address);
    if (addedAddresses[key]) return; // Skip duplicates

    addedAddresses[key] = true;
    destinations.push({
      id: idPrefix + '_' + UUIDUtils.createUUID(),
      street_address: address.address1 || '',
      city: address.city || '',
      region: address.stateCode || '',
      postal_code: address.postalCode || '',
      address_country: address.countryCode ? address.countryCode.value : ''
    });
  }

  // Add shipping address from current shipment
  if (shipment && shipment.shippingAddress) {
    addAddressIfUnique(shipment.shippingAddress, 'ship');
  }

  // Add billing address if different from shipping
  if (lineItemContainer.billingAddress) {
    addAddressIfUnique(lineItemContainer.billingAddress, 'bill');
  }

  // Add shipping addresses from all other shipments (if multi-shipment)
  if (lineItemContainer.shipments && lineItemContainer.shipments.length > 1) {
    collections.forEach(lineItemContainer.shipments, function (otherShipment) {
      if (otherShipment.UUID !== (shipment ? shipment.UUID : null) && otherShipment.shippingAddress) {
        addAddressIfUnique(otherShipment.shippingAddress, 'ship');
      }
    });
  }

  return destinations;
}

/**
 * Get all applicable shipping methods as options
 * @param {dw.order.Shipment} shipment - Current shipment
 * @param {dw.order.LineItemCtnr} lineItemContainer - SFCC basket or order
 * @returns {Array} - Array of shipping option objects
 */
function getShippingOptions(shipment, lineItemContainer) {
  var options = [];

  try {
    var shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment);
    var applicableShippingMethods = shipmentShippingModel.getApplicableShippingMethods();

    collections.forEach(applicableShippingMethods, function (method) {
      // Calculate shipping cost for this method
      var shippingCost = method.getShippingCost(lineItemContainer.getAdjustedMerchandizeTotalPrice());

      options.push({
        id: method.ID,
        title: method.displayName || method.ID,
        totals: [
          {
            type: 'subtotal',
            amount: moneyToCents(shippingCost)
          },
          {
            type: 'total',
            amount: moneyToCents(shippingCost)
          }
        ]
      });
    });
  } catch (e) {
    // Fallback: if we can't get applicable methods, return selected method if available
    var shippingMethod = shipment.shippingMethod;
    if (shippingMethod) {
      options.push({
        id: shippingMethod.ID,
        title: shippingMethod.displayName || shippingMethod.ID,
        totals: [
          {
            type: 'subtotal',
            amount: moneyToCents(shipment.shippingTotalNetPrice)
          },
          {
            type: 'total',
            amount: moneyToCents(shipment.shippingTotalGrossPrice)
          }
        ]
      });
    }
  }

  return options;
}

/**
 * Get fulfillment information with progressive disclosure
 * @param {dw.order.LineItemCtnr} lineItemContainer - SFCC basket or order
 * @param {Object} requestFulfillment - Fulfillment data from the request (optional)
 * @returns {Object} - Fulfillment object
 */
function getFulfillment(lineItemContainer, requestFulfillment) {
  var methods = [];
  var ucpHelpers = require('*/cartridge/scripts/helpers/ucpHelpers');

  // Return empty object if no shipments
  if (!lineItemContainer.shipments || lineItemContainer.shipments.length === 0) {
    return {};
  }

  collections.forEach(lineItemContainer.shipments, function (shipment) {
    // Get all line item IDs for this shipment
    var shipmentLineItemIds = [];
    collections.forEach(shipment.productLineItems, function (pli) {
      shipmentLineItemIds.push(pli.UUID || UUIDUtils.createUUID());
    });

    // Skip if no line items
    if (shipmentLineItemIds.length === 0) {
      return;
    }

    // Determine what stage of fulfillment we're in based on request
    var requestMethod = requestFulfillment && requestFulfillment.methods && requestFulfillment.methods.length > 0
      ? requestFulfillment.methods[0]
      : null;

    var hasRequestDestinations = requestMethod && requestMethod.destinations && requestMethod.destinations.length > 0;
    var hasRequestSelectedDestination = requestMethod && requestMethod.selected_destination_id;
    var hasRequestSelectedOption = requestMethod && requestMethod.groups && requestMethod.groups.length > 0
      && requestMethod.groups[0].selected_option_id;

    // Get destinations
    var allDestinations = [];

    // If agent provided destinations in request, use those (they are the shipping addresses)
    if (hasRequestDestinations) {
      allDestinations = ucpHelpers.assignDestinationIds(requestMethod.destinations);
    } else {
      // No destinations in request - provide available fulfillment addresses

      // First, try to get from customer's address book if available
      if (lineItemContainer.customer && lineItemContainer.customer.registered) {
        var customerDestinations = ucpHelpers.getCustomerAddressBookDestinations(lineItemContainer.customer);
        if (customerDestinations.length > 0) {
          allDestinations = customerDestinations;
        }
      }

      // If no customer addresses, get current shipping address from basket
      if (allDestinations.length === 0) {
        allDestinations = getDestinations(lineItemContainer, shipment);
      }

      // If still no destinations, get store addresses as fulfillment options
      if (allDestinations.length === 0) {
        allDestinations = ucpHelpers.getFulfillmentAddresses();
      }
    }

    // Determine selected destination ID
    var selectedDestinationId = null;

    // Override with request selection if provided
    if (hasRequestSelectedDestination) {
      selectedDestinationId = requestMethod.selected_destination_id;
    }

    // Auto-select first destination if destinations were provided in request
    if (hasRequestDestinations && !selectedDestinationId && allDestinations.length > 0) {
      selectedDestinationId = allDestinations[0].id;
    }

    // Build the fulfillment method
    var method = {
      id: shipment.UUID || UUIDUtils.createUUID(),
      type: 'shipping',
      line_item_ids: shipmentLineItemIds
    };

    // Always include destinations if we have any
    if (allDestinations.length > 0) {
      method.destinations = allDestinations;
    }

    // Progressive disclosure: only add selected_destination_id and groups if destination is selected
    var shouldShowGroups = selectedDestinationId || hasRequestDestinations || hasRequestSelectedDestination;

    if (shouldShowGroups && selectedDestinationId) {
      method.selected_destination_id = selectedDestinationId;

      // Get all applicable shipping options
      var options = getShippingOptions(shipment, lineItemContainer);

      // Create groups for shipping options
      if (options.length > 0) {
        var selectedOptionId = null;

        // Check if there's a stored selection
        if (shipment.shippingMethod) {
          selectedOptionId = shipment.shippingMethod.ID;
        }

        // Override with request selection if provided
        if (hasRequestSelectedOption) {
          selectedOptionId = requestMethod.groups[0].selected_option_id;
        }

        var group = {
          id: 'group_' + (shipment.UUID || UUIDUtils.createUUID()),
          line_item_ids: shipmentLineItemIds,
          options: options
        };

        // Only add selected_option_id if one is actually selected
        if (selectedOptionId) {
          group.selected_option_id = selectedOptionId;
        }

        method.groups = [group];
      }
    }

    methods.push(method);
  });

  // Only return fulfillment object if we have methods
  if (methods.length === 0) {
    return {};
  }

  return {
    methods: methods
  };
}

/**
 * Determine checkout status and generate validation messages
 * @param {dw.order.LineItemCtnr} lineItemContainer - SFCC basket or order
 * @param {Object} fulfillment - Fulfillment object from response
 * @param {string} providedStatus - Status provided to constructor
 * @returns {Object} - Object with status and messages array
 */
function determineStatusAndMessages(lineItemContainer, fulfillment, providedStatus) {
  var messages = [];
  var status = providedStatus || 'ready_for_complete';

  // If status was explicitly provided, use it
  if (providedStatus) {
    return { status: status, messages: messages };
  }

  // Check if fulfillment is incomplete
  if (fulfillment && fulfillment.methods && fulfillment.methods.length > 0) {
    var method = fulfillment.methods[0];

    // Check if shipping method is selected
    var hasSelectedShippingMethod = false;
    if (method.groups && method.groups.length > 0) {
      hasSelectedShippingMethod = method.groups[0].selected_option_id != null;
    }

    // If we have a fulfillment method but no shipping option selected, mark as incomplete
    if (!hasSelectedShippingMethod) {
      status = 'incomplete';
      messages.push({
        type: 'error',
        code: 'missing',
        path: '$.fulfillment.methods[0].groups[0].selected_option_id',
        content: 'Please select a fulfillment option',
        severity: 'recoverable'
      });
    }
  }

  return { status: status, messages: messages };
}

/**
 * Get payment handlers
 * @returns {Array} - Array of payment handler objects
 */
function getPaymentHandlers() {
  const Site = require('dw/system/Site');

  return [
    {
      "version": "2026-01-11",
      "id": "CREDIT_CARD",
      "name": "com.common.credit_card",
      "spec": "https://ucp.dev/schemas/shopping/types/card_payment_instrument.json",
      "config_schema": "https://ucp.dev/schemas/shopping/types/card_payment_instrument.json",
      "instrument_schemas": [
        "https://ucp.dev/schemas/shopping/types/card_payment_instrument.json"
      ],
      "config": {
        "endpoint": URLUtils.https('UCP-Tokenize').toString(),
        "identity": {
          "access_token": 'tok_' + Site.getCurrent().ID
        }
      }
    }
  ];
}

/**
 * Get payment instruments
 * @returns {Array} - Array of payment instrument objects
 */
function getPaymentInstruments() {
  return [];
}

/**
 * @constructor
 * @classdesc CheckoutSessionResponseModel class that represents the UCP checkout session
 *
 * @param {string} sessionID - Session ID
 * @param {dw.order.LineItemCtnr} lineItemContainer - Current user's line item container
 * @param {string} status - Status of the checkout session
 * @param {Object} requestFulfillment - Fulfillment data from the request (optional)
 * @param {Object} buyer - Buyer data from the request (optional)
 */
function CheckoutSessionResponseModel(sessionID, lineItemContainer, status, requestFulfillment, buyer) {
  const ucpHelpers = require('*/cartridge/scripts/helpers/ucpHelpers');
  const capabilities = ucpHelpers.getShopConfig().capabilities || [];
  const baseUrl = request.httpProtocol + '://' + request.httpHost;

  // UCP version and capabilities
  this.ucp = {
    version: '2026-01-11',
    services: {
      "dev.ucp.shopping": {
        "version": "2026-01-11",
        "spec": "https://ucp.dev/specs/shopping",
        "rest": {
          "schema": "https://ucp.dev/services/shopping/openapi.json",
          "endpoint": baseUrl
        }
      }
    },
    capabilities: capabilities.map(function (capability) {
      return ucpHelpers.getCapabilityFromMap(capability);
    }),
  };

  this.links = [];
  this.payment = {
    handlers: getPaymentHandlers(),
    instruments: getPaymentInstruments()
  };

  if (capabilities.includes('buyer_consent')) {
    this.links = this.links.concat(ucpHelpers.getBuyerConsentLinks());
  }

  if (capabilities.includes('discount')) {
    this.discounts = getDiscounts(lineItemContainer);
  }

  this.buyer = getBuyerInfo(buyer || {}, lineItemContainer || {});

  if (lineItemContainer !== null) {
    this.id = sessionID;
    this.line_items = mapLineItems(lineItemContainer);
    this.currency = lineItemContainer.currencyCode;

    // Only include fulfillment if request asked for it or has fulfillment data
    var fulfillment = null;
    var requestedFulfillment = requestFulfillment && requestFulfillment.methods && requestFulfillment.methods.length > 0;

    this.totals = getBasketTotals(lineItemContainer, requestedFulfillment);

    if (capabilities.includes('fulfillment') && requestedFulfillment) {
      fulfillment = getFulfillment(lineItemContainer, requestFulfillment);
      if (fulfillment.methods && fulfillment.methods.length > 0) {
        this.fulfillment = fulfillment;
      }
    }

    // Determine status and messages based on fulfillment completeness
    var statusAndMessages = determineStatusAndMessages(lineItemContainer, fulfillment, status);
    this.status = statusAndMessages.status;

    // Only include messages array if there are messages
    if (statusAndMessages.messages.length > 0) {
      this.messages = statusAndMessages.messages;
    }

    // Only include order object when checkout is completed
    if (this.status === 'completed') {
      if (lineItemContainer instanceof Order) {
        this.order = {
          id: lineItemContainer.orderNo,
          // TODO: CSFR Token problem
          permalink_url: URLUtils.https(
            'Order-Track',
            'trackOrderNumber', lineItemContainer.orderNo,
            'trackOrderEmail', lineItemContainer.customerEmail,
            'trackOrderPostal', lineItemContainer.billingAddress ? lineItemContainer.billingAddress.postalCode : ''
          ).toString()
        };
      } else {
        // Fallback for completed basket (shouldn't normally happen)
        this.order = {
          id: this.id,
          permalink_url: URLUtils.https('Cart-Show').toString()
        };
      }
    }
  } else {
    // Empty basket
    this.id = UUIDUtils.createUUID();
    this.line_items = [];
    this.status = status || 'ready_for_complete';
    this.currency = 'USD';
    this.totals = [];
    this.discounts = { codes: [], applied: [] };
  }
}

module.exports = CheckoutSessionResponseModel;
