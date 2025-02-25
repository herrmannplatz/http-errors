/*!
 * http-errors
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2016 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

const deprecate = require('depd')('http-errors')
const statuses = require('statuses')
const toIdentifier = require('toidentifier')

class HttpError extends Error {
  constructor (status, message) {
    if (new.target === HttpError) {
      throw new TypeError('cannot construct abstract class')
    }
    super(message)
    this.status = this.statusCode = status
  }
}

/**
 * Module exports.
 * @public
 */

module.exports = createError
module.exports.HttpError = HttpError
module.exports.isHttpError = createIsHttpErrorFunction(HttpError)

// Populate exports for all constructors
populateConstructorExports(module.exports, statuses.codes)

/**
 * Get the code class of a status code.
 * @private
 */

function codeClass (status) {
  return Number(String(status).charAt(0) + '00')
}

/**
 * Create a new HTTP Error.
 *
 * @returns {Error}
 * @public
 */

function createError (...args) {
  // so much arity going on ~_~
  let err
  let msg
  let status = 500
  let props = {}
  for (let i = 0; i < arguments.length; i++) {
    const arg = arguments[i]
    const type = typeof arg
    if (type === 'object' && arg instanceof Error) {
      err = arg
      status = err.status || err.statusCode || status
    } else if (type === 'number' && i === 0) {
      status = arg
    } else if (type === 'string') {
      msg = arg
    } else if (type === 'object') {
      props = arg
    } else {
      throw new TypeError('argument #' + (i + 1) + ' unsupported type ' + type)
    }
  }

  if (typeof status === 'number' && (status < 400 || status >= 600)) {
    deprecate('non-error status code; use only 4xx or 5xx status codes')
  }

  if (typeof status !== 'number' ||
    (!statuses.message[status] && (status < 400 || status >= 600))) {
    status = 500
  }

  // constructor
  const HttpError = createError[status] || createError[codeClass(status)]

  if (!err) {
    // create error
    err = HttpError
      ? new HttpError(msg)
      : new Error(msg || statuses.message[status])
    Error.captureStackTrace(err, createError)
  }

  if (!HttpError || !(err instanceof HttpError) || err.status !== status) {
    // add properties to generic error
    err.expose = status < 500
    err.status = err.statusCode = status
  }

  for (const key in props) {
    if (key !== 'status' && key !== 'statusCode') {
      err[key] = props[key]
    }
  }

  return err
}

/**
 * Create a constructor for a client error.
 * @private
 */

function createClientErrorConstructor (name, code) {
  const className = toClassName(name)

  class ClientError extends HttpError {
    constructor (message) {
      const msg = message != null ? message : statuses.message[code]
      super(code, msg)
      this.name = className
      this.expose = true
    }
  }

  nameFunc(ClientError, className)

  return ClientError
}

/**
 * Create function to test is a value is a HttpError.
 * @private
 */

function createIsHttpErrorFunction (HttpError) {
  return function isHttpError (val) {
    if (!val || typeof val !== 'object') {
      return false
    }

    if (val instanceof HttpError) {
      return true
    }

    return val instanceof Error &&
      typeof val.expose === 'boolean' &&
      typeof val.statusCode === 'number' && val.status === val.statusCode
  }
}

/**
 * Create a constructor for a server error.
 * @private
 */

function createServerErrorConstructor (name, code) {
  const className = toClassName(name)

  class ServerError extends HttpError {
    constructor (message) {
      const msg = message != null ? message : statuses.message[code]
      super(code, msg)
      this.name = className
      this.expose = false
    }
  }

  nameFunc(ServerError, className)

  return ServerError
}

/**
 * Set the name of a function, if possible.
 * @private
 */

function nameFunc (func, name) {
  const desc = Object.getOwnPropertyDescriptor(func, 'name')

  if (desc?.configurable) {
    desc.value = name
    Object.defineProperty(func, 'name', desc)
  }
}

/**
 * Populate the exports object with constructors for every error class.
 * @private
 */

function populateConstructorExports (exports, codes) {
  codes.forEach(function forEachCode (code) {
    const name = toIdentifier(statuses.message[code])
    let CodeError

    switch (codeClass(code)) {
      case 400:
        CodeError = createClientErrorConstructor(name, code)
        break
      case 500:
        CodeError = createServerErrorConstructor(name, code)
        break
    }

    if (CodeError) {
      // export the constructor
      exports[code] = CodeError
      exports[name] = CodeError
    }
  })
}

/**
 * Get a class name from a name identifier.
 *
 * @param {string} name
 * @returns {string}
 * @private
 */

function toClassName (name) {
  return name.slice(-5) === 'Error' ? name : name + 'Error'
}
