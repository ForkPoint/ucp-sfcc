'use strict';

/**
 * Custom middleware for handling UCP requests
 */

const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const CustomerMgr = require('dw/customer/CustomerMgr');
const Transaction = require('dw/system/Transaction');
const BasketMgr = require('dw/order/BasketMgr');
const OrderMgr = require('dw/order/OrderMgr');
const UUIDUtils = require('dw/util/UUIDUtils');
const URLRedirectMgr = require('dw/web/URLRedirectMgr');
const logger = require('dw/system/Logger').getLogger('UCP', 'UCP');

const basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
const CheckoutSessionResponse = require('*/cartridge/scripts/models/CheckoutSessionResponse');
const ucpHelpers = require('*/cartridge/scripts/helpers/ucpHelpers');
const cartHelpers = require('*/cartridge/scripts/cart/cartHelpers');


/**
 * Handle the /.well-known/ucp discovery request
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 * @returns {Object} - UCP discovery configuration
 */
function handleUCPDiscoveryRequest(req, res, next) {
  // Set the content type to JSON
  res.setHttpHeader('Content-Type', 'application/json');

  try {
    logger.info('Handling UCP Discovery Request');
    const ucpDiscoveryConfig = new CheckoutSessionResponse();

    res.setStatusCode(200);
    res.render('ucp/json', { jsonResponse: ucpDiscoveryConfig });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('Error in handleUCPDiscoveryRequest: {0}\n{1}', errorMessage, e.stack);
    ucpHelpers.renderError(res, errorMessage, 500);
  }

  return this.done(req, res, next);
}

/**
 * Handle POST /checkout-sessions - Create a new checkout session
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 * @returns {Object} - Checkout session response
 */
function handleCreateCheckoutSessionRequest(req, res, next) {
  res.setHttpHeader('Content-Type', 'application/json');

  try {
    logger.info('Handling Create Checkout Session Request');

    const requestBody = JSON.parse(req.body);
    const result = ucpHelpers.validateRequest(req, res, requestBody, null);

    if (result.error) return this.done(req, res, next);

    // Fail-safe against SFRA base.getBasket() returning null
    BasketMgr.getCurrentOrNewBasket();

    const tempBasket = BasketMgr.createTemporaryBasket();

    Transaction.wrap(function () {
      // Update line items
      if (requestBody.line_items) {
        ucpHelpers.updateLineItems(tempBasket, requestBody.line_items, req);
      }

      // Update buyer information
      if (requestBody.buyer) {
        ucpHelpers.updateBuyerInfo(tempBasket, requestBody.buyer);
      }

      ucpHelpers.ensureNoEmptyShipments(req, tempBasket);
      cartHelpers.ensureAllShipmentsHaveMethods(tempBasket);
      basketCalculationHelpers.calculateTotals(tempBasket);
    });

    // Build response with request fulfillment data for progressive disclosure
    const sessionID = UUIDUtils.createUUID();
    const response = new CheckoutSessionResponse(sessionID, tempBasket, null, requestBody.fulfillment, requestBody.buyer);
    const buyer = requestBody.buyer || {};

    Transaction.wrap(function () {
      var ucpSession = CustomObjectMgr.createCustomObject('UCPCheckoutSession', sessionID);
      ucpSession.custom.email = buyer.email || '';
      ucpSession.custom.fullName = buyer.full_name || '';
      ucpSession.custom.status = response.status;
      ucpSession.custom.basketContent = JSON.stringify(response);
      ucpSession.custom.marketingConsent = JSON.stringify(buyer.consent || '{}');
      BasketMgr.deleteTemporaryBasket(tempBasket);
      CustomerMgr.logoutCustomer(false);
    });

    res.setStatusCode(201);
    res.render('ucp/json', { jsonResponse: response });
    return this.done(req, res, next);
  } catch (e) {
    logger.error('Error in handleCreateCheckoutSessionRequest: {0}\n{1}', e.message, e.stack);
    ucpHelpers.renderError(res, 'Internal server error', 500);
    return this.done(req, res, next);
  }
}

/**
 * Handle GET /checkout-sessions - Get a checkout session
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 * @returns {Object} - Checkout session response
 */
function handleGetCheckoutSessionRequest(req, res, next) {
  res.setHttpHeader('Content-Type', 'application/json');

  try {
    logger.info('Handling Get Checkout Session Request');

    const URLRedirectMgr = require('dw/web/URLRedirectMgr');
    const path = URLRedirectMgr.getRedirectOrigin();

    // Extract session ID from path
    const matches = path ? path.match(/checkout-sessions\/([a-f0-9-]{26,36})/) : null;
    if (!matches || !matches[1]) {
      ucpHelpers.renderError(res, 'Session not found', 404);
      return this.done(req, res, next);
    }

    var ucpSession = CustomObjectMgr.getCustomObject('UCPCheckoutSession', matches[1]);
    if (ucpSession && ucpSession.custom.basketContent) {
      const basketContent = JSON.parse(ucpSession.custom.basketContent);
      res.setStatusCode(200);
      res.render('ucp/json', { jsonResponse: basketContent });
      return this.done(req, res, next);
    } else {
      ucpHelpers.renderError(res, 'Session not found', 404);
      return this.done(req, res, next);
    }
  } catch (e) {
    logger.error('Error in handleCreateCheckoutSessionRequest: {0}\n{1}', e.message, e.stack);
    ucpHelpers.renderError(res, 'Internal server error', 500);
    return this.done(req, res, next);
  }
}

/**
 * Handle PUT /checkout-sessions/{id} - Modify basket/session
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 * @returns {Object} - Updated checkout session response
 */
function handleModifyBasketRequest(req, res, next) {
  let basket = null;

  res.setHttpHeader('Content-Type', 'application/json');

  try {
    logger.info('Handling Modify Basket Request');
    const path = URLRedirectMgr.getRedirectOrigin();

    // Extract session ID from path
    const matches = path ? path.match(/checkout-sessions\/([a-f0-9-]{26,36})/) : null;
    if (!matches || !matches[1]) {
      ucpHelpers.renderError(res, 'Session not found', 404);
      return this.done(req, res, next);
    }

    const requestBody = JSON.parse(req.body);
    const result = ucpHelpers.validateRequest(req, res, requestBody);
    if (result.error) return this.done(req, res, next);

    const sessionUUID = matches[1];
    var ucpSession = CustomObjectMgr.getCustomObject('UCPCheckoutSession', sessionUUID);
    if (!ucpSession) {
      ucpHelpers.renderError(res, 'Session not found', 404);
      return this.done(req, res, next);
    }

    // Fail-safe against SFRA base.getBasket() returning null
    BasketMgr.getCurrentOrNewBasket();

    basket = BasketMgr.createTemporaryBasket();

    // Process basket updates
    if (basket) {
      Transaction.wrap(function () {
        // Update line items
        if (requestBody.line_items) {
          ucpHelpers.updateLineItems(basket, requestBody.line_items, req);
        }

        // Apply discount codes
        if (requestBody.discounts && requestBody.discounts.codes) {
          ucpHelpers.applyDiscountCodes(basket, requestBody.discounts.codes);
        }

        // Update fulfillment (shipping)
        if (requestBody.fulfillment && requestBody.fulfillment.methods) {
          ucpHelpers.updateFulfillment(basket, requestBody.fulfillment);
        }

        // Update buyer information
        if (requestBody.buyer) {
          ucpHelpers.updateBuyerInfo(basket, requestBody.buyer);
        } else {
          const buyer = {
            email: ucpSession.custom.email,
            full_name: ucpSession.custom.fullName,
            consent: JSON.parse(ucpSession.custom.marketingConsent || '{}')
          };
          ucpHelpers.updateBuyerInfo(basket, buyer);
        }

        // Recalculate basket totals
        ucpHelpers.ensureNoEmptyShipments(req, basket);
        cartHelpers.ensureAllShipmentsHaveMethods(basket);
        basketCalculationHelpers.calculateTotals(basket);
      });
    }

    // Build response with request fulfillment data for progressive disclosure
    const response = new CheckoutSessionResponse(sessionUUID, basket, null, requestBody.fulfillment, requestBody.buyer);
    const buyer = requestBody.buyer || {};

    Transaction.wrap(function () {
      ucpSession.custom.basketContent = JSON.stringify(response);
      ucpSession.custom.status = response.status;
      ucpSession.custom.email = buyer.email || '';
      ucpSession.custom.fullName = response.buyer.full_name || '';
      ucpSession.custom.marketingConsent = JSON.stringify(buyer.consent || '{}');
      BasketMgr.deleteTemporaryBasket(basket);
      CustomerMgr.logoutCustomer(false);
    });

    // Save idempotency record
    const idempotencyKey = request.httpHeaders.get('idempotency-key');
    const requestHash = ucpHelpers.computeHash(requestBody);
    ucpHelpers.saveIdempotencyRecord(sessionUUID, idempotencyKey, requestHash, JSON.stringify(response), 200);

    res.setStatusCode(200);
    res.render('ucp/json', { jsonResponse: response });
    return this.done(req, res, next);
  } catch (e) {
    logger.error('Error in handleModifyBasketRequest: {0}\n{1}', e.message, e.stack);
    ucpHelpers.renderError(res, 'Internal server error', 500);
    return this.done(req, res, next);
  }
}

/**
 * Handle POST /checkout-sessions/{id}/complete - Complete order
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 * @returns {Object} - Completed checkout session with order info
 */
function handleCompleteOrderRequest(req, res, next) {
  const ucpHelpers = require('*/cartridge/scripts/helpers/ucpHelpers');
  const basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
  const CheckoutSessionResponse = require('*/cartridge/scripts/models/CheckoutSessionResponse');
  const COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
  const URLRedirectMgr = require('dw/web/URLRedirectMgr');
  const Resource = require('dw/web/Resource');

  const hooksHelper = require('*/cartridge/scripts/helpers/hooks');

  res.setHttpHeader('Content-Type', 'application/json');

  try {
    logger.info('Handling Complete Order Request');

    const requestBody = JSON.parse(req.body);
    const result = ucpHelpers.validateCompleteOrderRequest(req, res, requestBody);
    if (result.error) return this.done(req, res, next);

    const basket = BasketMgr.createTemporaryBasket();
    ucpHelpers.populateBasketFromUCPBasket(basket, result.ucpBasket);

    // Process payment data if provided
    if (basket && requestBody.payment_data) {
      Transaction.wrap(function () {
        ucpHelpers.processPaymentInstrument(basket, requestBody.payment_data);

        ucpHelpers.ensureNoEmptyShipments(req, basket);
        cartHelpers.ensureAllShipmentsHaveMethods(basket);
        basketCalculationHelpers.calculateTotals(basket);
      });
    }

     // Re-validates existing payment instruments
     var validPayment = COHelpers.validatePayment(req, basket);
     if (validPayment.error) {
        ucpHelpers.renderError(res, Resource.msg('error.payment.not.valid', 'checkout', null), 400);
        return this.done(req, res, next);
     }

     // Re-calculate the payments.
     var calculatedPaymentTransactionTotal = COHelpers.calculatePaymentTransaction(basket);
     if (calculatedPaymentTransactionTotal.error) {
          ucpHelpers.renderError(res, Resource.msg('error.technical', 'checkout', null), 400);
          return this.done(req, res, next);
     }

     // Creates a new order.
     var order = COHelpers.createOrder(basket);
     if (!order) {
          ucpHelpers.renderError(res, Resource.msg('error.technical', 'checkout', null), 400);
          return this.done(req, res, next);
     }

     // Handles payment authorization
     var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);
     if (handlePaymentResult.error) {
          ucpHelpers.renderError(res, Resource.msg('error.technical', 'checkout', null), 400);
          return this.done(req, res, next);
     }

     var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', basket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
     if (fraudDetectionStatus.status === 'fail') {
         Transaction.wrap(function () {
          OrderMgr.failOrder(order);
        });

          ucpHelpers.renderError(res, Resource.msg('error.technical', 'checkout', null), 400);
          return this.done(req, res, next);
     }

     // Places the order
     var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
     if (placeOrderResult.error) {
          ucpHelpers.renderError(res, Resource.msg('error.technical', 'checkout', null), 400);
          return this.done(req, res, next);
     }

    // Build response with completed order
    const response = new CheckoutSessionResponse(order.orderNo, order, 'completed');

    // Send webhook notification if agent profile has webhook_url
    if (!result.error && result.agentProfile && result.agentProfile.webhook_url) {
      ucpHelpers.sendWebhookNotification(result.agentProfile.webhook_url, response);
    }

    // Send confirmation email
    COHelpers.sendConfirmationEmail(order, req.locale.id);

    CustomerMgr.logoutCustomer(false);

    res.setStatusCode(200);
    res.render('ucp/json', { jsonResponse: response });
    return this.done(req, res, next);
  } catch (e) {
    logger.error('Error in handleCompleteOrderRequest: {0}\n{1}', e.message, e.stack);
    ucpHelpers.renderError(res, 'Internal server error', 500);
    return this.done(req, res, next);
  }
}

/**
 * Handle POST /tokenize - Tokenize payment data
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 * @returns {Object} - Tokenized payment data
 */
function handleTokenizeRequest(req, res, next) {
  const Transaction = require('dw/system/Transaction');
  const ucpHelpers = require('*/cartridge/scripts/helpers/ucpHelpers');

  res.setHttpHeader('Content-Type', 'application/json');

  try {
    logger.info('Handling Tokenize Request');
    const requestBody = JSON.parse(req.body);

    if (!requestBody.credential) {
      ucpHelpers.renderError(res, 'Credential is required', 400);
      return next();
    }

    const token = 'tok_' + UUIDUtils.createUUID();

    Transaction.wrap(function () {
      var ucpTokenizer = CustomObjectMgr.createCustomObject('UCPTokenizer', token);
      ucpTokenizer.custom.data = ucpHelpers.encodeToken(requestBody.credential);
    });

    res.setStatusCode(200);
    res.render('ucp/json', { jsonResponse: { token: token } });
  } catch (e) {
    logger.error('Error in handleTokenizeRequest: {0}\n{1}', e.message, e.stack);
    ucpHelpers.renderError(res, 'Internal server error', 500);
  }

  next();
}
module.exports = {
  handleUCPDiscoveryRequest: handleUCPDiscoveryRequest,
  handleGetCheckoutSessionRequest: handleGetCheckoutSessionRequest,
  handleCreateCheckoutSessionRequest: handleCreateCheckoutSessionRequest,
  handleModifyBasketRequest: handleModifyBasketRequest,
  handleCompleteOrderRequest: handleCompleteOrderRequest,
  handleTokenizeRequest: handleTokenizeRequest
};
