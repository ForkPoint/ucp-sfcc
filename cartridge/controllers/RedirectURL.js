'use strict';

const server = require('server');
server.extend(module.superModule);

/**
 * Prepend the Start controller to intercept the incoming path request and route
 * the request to the appropriate middleware handler without using aliases.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 * @returns {void}
 */
server.prepend('Start', function (req, res, next) {
  const URLRedirectMgr = require('dw/web/URLRedirectMgr');
  const ucpMiddleware = require('*/cartridge/scripts/middleware/ucp');
  const ucpHelpers = require('*/cartridge/scripts/helpers/ucpHelpers');
  const logger = require('dw/system/Logger').getLogger('UCP', 'UCP');
  const path = URLRedirectMgr.getRedirectOrigin();
  const method = req.httpMethod;
  const config = ucpHelpers.getShopConfig();

  // Intercept the incoming path request
  if (path === '/.well-known/ucp' || /^\/checkout-sessions/.test(path)) {
    let response;

    if (config.debug) {
      logger.info('UCP Debug Path: {0}', path);
      logger.info('UCP Debug Request Body: {0}', req.body);
    }

    try {
      switch (true) {
        // GET /.well-known/ucp
        case /^\/.well-known\/ucp$/.test(path) && method === 'GET':
          response = ucpMiddleware.handleUCPDiscoveryRequest.call(this, req, res, next);
          break;

        // POST /checkout-sessions
        case /^\/checkout-sessions$/.test(path) && method === 'POST':
          response = ucpMiddleware.handleCreateCheckoutSessionRequest.call(this, req, res, next);
          break;

        // GET /checkout-sessions/{session_id}
        case /^\/checkout-sessions\/[a-f0-9-]{26,36}$/.test(path) && method === 'GET':
          response = ucpMiddleware.handleGetCheckoutSessionRequest.call(this, req, res, next);
          break;

        // PUT /checkout-sessions/{session_id}
        case /^\/checkout-sessions\/[a-f0-9-]{26,36}$/.test(path) && method === 'PUT':
          response = ucpMiddleware.handleModifyBasketRequest.call(this, req, res, next);
          break;

        // POST /checkout-sessions/{session_id}/complete
        case /^\/checkout-sessions\/[a-f0-9-]{26,36}\/complete$/.test(path) && method === 'POST':
          response = ucpMiddleware.handleCompleteOrderRequest.call(this, req, res, next);
          break;

        // TODO: add cancel endpoint

        // Malformed request, let the default redirect URL handler handle it
        default:
          response = next();
          break;
      }
    } catch (e) {
      res.setStatusCode(500);
      res.setHttpHeader('Content-Type', 'application/json');
      res.render('ucp/json', { jsonResponse: { error: true, message: e.message } });

      return this.done(req, res, next);
    }

    if (config.debug) {
      logger.info('UCP Debug Response: {0}', JSON.stringify(res.viewData.jsonResponse));
    }

    return response;
  }

  next();
});

module.exports = server.exports();
