// Generated from out/LumenTab.sol/LumenTab.json (forge inspect LumenTab abi)
export const lumenTabAbi = [
 {
  "type": "constructor",
  "inputs": [
   {
    "name": "usdc_",
    "type": "address",
    "internalType": "contract IERC20"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "MAX_CLOSE_DELAY",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint64",
    "internalType": "uint64"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "MIN_CLOSE_DELAY",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint64",
    "internalType": "uint64"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "VOUCHER_TYPEHASH",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "available",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "closeByProvider",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "cumulative",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "signature",
    "type": "bytes",
    "internalType": "bytes"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "domainSeparator",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "eip712Domain",
  "inputs": [],
  "outputs": [
   {
    "name": "fields",
    "type": "bytes1",
    "internalType": "bytes1"
   },
   {
    "name": "name",
    "type": "string",
    "internalType": "string"
   },
   {
    "name": "version",
    "type": "string",
    "internalType": "string"
   },
   {
    "name": "chainId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "verifyingContract",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "salt",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "extensions",
    "type": "uint256[]",
    "internalType": "uint256[]"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "finalize",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "getTab",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct LumenTab.Tab",
    "components": [
     {
      "name": "payer",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "provider",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "signer",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "closeDelay",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "closeAt",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "closed",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "deposited",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "paid",
      "type": "uint128",
      "internalType": "uint128"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "nextTabId",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "open",
  "inputs": [
   {
    "name": "provider",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "signer",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "closeDelay",
    "type": "uint64",
    "internalType": "uint64"
   },
   {
    "name": "providerAgentId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "redeem",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "cumulative",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "signature",
    "type": "bytes",
    "internalType": "bytes"
   }
  ],
  "outputs": [
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "requestClose",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "topUp",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "usdc",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract IERC20"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "voucherDigest",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "cumulative",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "event",
  "name": "CloseRequested",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "closeAt",
    "type": "uint64",
    "indexed": false,
    "internalType": "uint64"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "EIP712DomainChanged",
  "inputs": [],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Redeemed",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "cumulative",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "amount",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "TabClosed",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "paidToProvider",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "refundedToPayer",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "TabOpened",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "payer",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "provider",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "signer",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "closeDelay",
    "type": "uint64",
    "indexed": false,
    "internalType": "uint64"
   },
   {
    "name": "providerAgentId",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "TabToppedUp",
  "inputs": [
   {
    "name": "tabId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "from",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "deposited",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   }
  ],
  "anonymous": false
 },
 {
  "type": "error",
  "name": "AddressEmptyCode",
  "inputs": [
   {
    "name": "target",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "AddressInsufficientBalance",
  "inputs": [
   {
    "name": "account",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "BadCloseDelay",
  "inputs": []
 },
 {
  "type": "error",
  "name": "BadSignature",
  "inputs": []
 },
 {
  "type": "error",
  "name": "CloseAlreadyRequested",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ExceedsDeposit",
  "inputs": []
 },
 {
  "type": "error",
  "name": "FailedInnerCall",
  "inputs": []
 },
 {
  "type": "error",
  "name": "InvalidShortString",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotClaimable",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotPayer",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotProvider",
  "inputs": []
 },
 {
  "type": "error",
  "name": "SafeERC20FailedOperation",
  "inputs": [
   {
    "name": "token",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "StringTooLong",
  "inputs": [
   {
    "name": "str",
    "type": "string",
    "internalType": "string"
   }
  ]
 },
 {
  "type": "error",
  "name": "TabIsClosed",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TooEarly",
  "inputs": []
 },
 {
  "type": "error",
  "name": "UnknownTab",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ZeroAddress",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ZeroAmount",
  "inputs": []
 }
];

export const erc20Abi = [
  {type:'function',name:'approve',stateMutability:'nonpayable',inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}],outputs:[{type:'bool'}]},
  {type:'function',name:'allowance',stateMutability:'view',inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'a',type:'address'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'transfer',stateMutability:'nonpayable',inputs:[{name:'to',type:'address'},{name:'amount',type:'uint256'}],outputs:[{type:'bool'}]},
];
