"use strict";

import Web3 from "web3";
import FilterMgr from "./filter";
import RPCServer from "./rpc";
import Utils from "./utils";
import EventEmitter from "events";

class TrustWeb3Provider extends EventEmitter {
  constructor(config) {
    super();
    this.isTrust = true;
    this.chainId = config.chainId;
    this.address = (config.address || "").toLowerCase();
    this.ready = !!config.address;

    this._rpc = new RPCServer(config.rpcUrl);
    this._filterMgr = new FilterMgr(this._rpc);
    this._promises = {};
    this._connect();
  }

  setAddress(address) {
    this.address = (address || "").toLowerCase();
    this.ready = !!address;

    this._emitAccountsChanged([this.address]);
  }

  setConfig(config) {
    this.setAddress(config.address);
    this.chainId = config.chainId;
    this._rpc = new RPCServer(config.rpcUrl);
    this._filterMgr = new FilterMgr(this._rpc);
    this._emitNetworkChanged(this.chainId);
  }

  send(method, params, /* optional request id */ id) {
    console.log(`<== send ${method} ${JSON.stringify(params)}`);
    if (!method || typeof method !== "string") {
      return new Error("Method is not a valid string.");
    }

    if (!(params instanceof Array)) {
      return new Error("Params is not a valid array.");
    }

    if (!id) {
      id = Utils.genId();
    }
    const jsonrpc = "2.0";
    const payload = { jsonrpc, id, method, params };

    const promise = new Promise((resolve, reject) => {
      this._promises[payload.id] = { resolve, reject };
    });

    switch(payload.method) {
      case "eth_accounts":
        this._resolve(payload.id, this.eth_accounts());
        break;
      case "eth_coinbase":
        this._resolve(payload.id, this.eth_coinbase());
        break;
      case "net_version":
        this._resolve(payload.id, this.net_version());
        break;
      case "eth_chainId":
        this._resolve(payload.id, this.eth_chainId());
        break;
      case "eth_sign":
        this.eth_sign(payload);
        break;
      case "personal_sign":
        this.personal_sign(payload);
        break;
      case "personal_ecRecover":
        this.personal_ecRecover(payload);
        break;
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
        this.eth_signTypedData(payload);
        break;
      case "eth_sendTransaction":
        this.eth_sendTransaction(payload);
        break;
      case "eth_requestAccounts":
        this.eth_requestAccounts(payload);
        break;
      case "eth_newFilter":
        this.eth_newFilter(payload);
        break;
      case "eth_newBlockFilter":
        this.eth_newBlockFilter(payload);
        break;
      case "eth_newPendingTransactionFilter":
        this.eth_newPendingTransactionFilter(payload);
        break;
      case "eth_uninstallFilter":
        this.eth_uninstallFilter(payload);
        break;
      case "eth_getFilterChanges":
        this.eth_getFilterChanges(payload);
        break;
      case "eth_getFilterLogs":
        this.eth_getFilterLogs(payload);
        break;
      default:
        this._rpc.call(payload)
        .then(data => this._resolve(payload.id, data))
        .catch(error => this._reject(payload.id, error));
    }

    return promise;
  }

  /* Backwards Compatibility */

  enable() {
    // this may be undefined somehow
    var that = this || window.ethereum;
    return that.send("eth_requestAccounts", [])
    .then(result => {
      return result.result;
    });
  }

  sendAsync(payload, callback) {
    console.log(`<== sendAsync ${JSON.stringify(payload)}, ${callback}`);
    if (Array.isArray(payload)) {
      Promise.all(
        payload.map(this.send(payload.method, payload.params, payload.id)).bind(this)
      )
      .then(data => callback(null, data))
      .catch(error => callback(error, null));
    } else {
      this.send(payload.method, payload.params, payload.id)
      .then(data => callback(null, data))
      .catch(error => callback(error instanceof Error ? error : new Error(error), null));
    }
  }

  postMessage(handler, id, data) {
    if (this.ready || handler === "requestAccounts") {
      window.webkit.messageHandlers[handler].postMessage({
        "name": handler,
        "object": data,
        "id": id
      });
    } else {
      // don"t forget to verify in the app
      this._reject(id, new Error("provider is not ready"));
    }
  }

  _resolve(id, result) {
    console.log(`<== ${id} _resolve ${JSON.stringify(result)}`);
    let data = {jsonrpc: "2.0", id: id};
    if (typeof result === "object" && result.jsonrpc && result.result) {
      data.result = result.result;
    } else {
      data.result = result;
    }
    let { resolve } = this._promises[id];
    if (resolve) {
      resolve(data);
      delete this._promises[id];
    }
  }

  _reject(id, error) {
    // eslint-disable-next-line no-console
    console.log(`<== ${id} _reject ${JSON.stringify(error)}`);
    let { reject } = this._promises[id];
    if (reject) {
      // TODO: follow https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md#errors
      reject(error instanceof Error ? error : new Error(error));
      delete this._promises[id];
    }
  }

  _connect() {
    this._emitConnect();
  }

  /* Events */

  _emitNotification(result) {
    this.emit("notification", result);
  }

  _emitConnect() {
    this.emit("connect");
  }

  _emitClose(code, reason) {
    this.emit("close", code, reason);
  }

  _emitNetworkChanged(networkId) {
    this.emit("networkChanged", networkId);
  }

  _emitAccountsChanged(accounts) {
    this.emit("accountsChanged", accounts);
  }

  /* Internal RPC handlers */

  eth_accounts() {
    return this.address ? [this.address] : [];
  }

  eth_coinbase() {
    return this.address;
  }

  net_version() {
    return this.chainId.toString(10) || null;
  }

  eth_chainId() {
    return "0x" + this.chainId.toString(16);
  }

  eth_sign(payload) {
    this.postMessage("signMessage", payload.id, {data: payload.params[1]});
  }

  personal_sign(payload) {
    this.postMessage("signPersonalMessage", payload.id, {data: payload.params[0]});
  }

  personal_ecRecover(payload) {
    this.postMessage("ecRecover", payload.id, {signature: payload.params[1], message: payload.params[0]});
  }

  eth_signTypedData(payload) {
    this.postMessage("signTypedMessage", payload.id, {data: payload.params[1]});
  }

  eth_sendTransaction(payload) {
    this.postMessage("signTransaction", payload.id, payload.params[0]);
  }

  eth_requestAccounts(payload) {
    this.postMessage("requestAccounts", payload.id, {});
  }

  eth_newFilter(payload) {
    this._filterMgr.newFilter(payload)
    .then(filterId => this._resolve(payload.id, filterId))
    .catch(error => this._reject(payload.id, error));
  }

  eth_newBlockFilter(payload) {
    this._filterMgr.newBlockFilter()
    .then(filterId => this._resolve(payload.id, filterId))
    .catch(error => this._reject(payload.id, error));
  }

  eth_newPendingTransactionFilter(payload) {
    this._filterMgr.newPendingTransactionFilter()
    .then(filterId => this._resolve(payload.id, filterId))
    .catch(error => this._reject(payload.id, error));
  }

  eth_uninstallFilter(payload) {
    this._filterMgr.uninstallFilter(payload.params[0])
    .then(filterId => this._resolve(payload.id, filterId))
    .catch(error => this._reject(payload.id, error));
  }

  eth_getFilterChanges(payload) {
    this._filterMgr.getFilterChanges(payload.params[0])
    .then(data => this._resolve(payload.id, data))
    .catch(error => this._reject(payload.id, error));
  }

  eth_getFilterLogs(payload) {
    this._filterMgr.getFilterLogs(payload.params[0])
    .then(data => this._resolve(payload.id, data))
    .catch(error => this._reject(payload.id, error));
  }
}

window.Trust = TrustWeb3Provider;
window.Web3 = Web3;
