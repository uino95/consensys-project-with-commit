# Pistis DID Method Specification v1.0
This specification defines how Pistis deals with DID and DID Documents and how it interacts with the Ethereum blockchain. Also 
CRUD operations on DID documents are described. 
This specification confirms to the requirements specified in the DID specification[1] currently published by 
the W3C Credentials Community Group. 

Pistis is a credential management system based on the Ethereum blockchain. It provides a set of novel smart contracts to handle efficient multi signature operations, delegates management, permissioned access to extensible services based upon the Decentralized IDentifier specification.

## 1. Pistis DID Method Name
The namestring that shall identify this DID method is: `pistis`.

A DID that uses this method **MUST** begin with the following prefix: `did:pistis`. Per this DID specification, this string MUST be in lowercase.

## 2. Pistis DID Format
Pistis decentralized identifiers(DID) is of the following format:
```
did-pistis = "did:pistis:" id-string 
id-string = Ethereum Address
```
Indeed, a Pistis DID is simply and Ethereum address to which it is prepended the string "did:pistis:"

### Example
Example Pistis DIDs: 
```
did:pistis:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74
```
## 3. CRUD Operations
Pistis DID method relies on the PistisDidRegistry and MultiSigOperations. They are smart contracts that facilitate the resolution of the public keys who have certain permission over a certain DID. They also facilitate key rotation, delegate assignment and revocation to allow 3rd party signers on a key's behalf, as well as setting permission for any possible service related to a DID. These interactions and events are used in aggregate to form a DID's DID document using the Pistis-Did-Resolver. 

### 3.1 Create (Register)
A DID is generated by appending a newly generated Ethereum address to ‘did:pistis:’. The cryptographical suite to create a key pair comes from the same as bitcoin’s core, that is libsecp256k1. Generating the private key and public key is the same for both Bitcoin and Ethereum, they both use libsecp256k1 elliptic curve cryptography. Deriving an account address from the public key differs slightly. Deriving an Ethereum address from a public key requires an additional hashing algorithm. Taking the keccak-256 hash of the public key will return 32 bytes which you need to trim down to the last 20 bytes (40 characters in hex) to get the address[3].

The very first DID which has full permissions and is able to sign on behalf of the newly generated DID is that very same DID, that is the trivial one. The DID is thus created offline without the need to access the blockchain as it is just a matter of a key pair generation. Right after the creation of a DID it is important to set up some other DIDs to have the right permissions in order to enable key recovery.

### 3.2 Read (Resolve)
This is achieved through the DID Resolver, that is a software component with an API designed to accept requests for DID lookups and execute the corresponding DID method to retrieve the authoritative DID Document. As the W3C specification involves, the DDO contains a list of addresses which are authorized to sign on behalf of that DID, thus allowing a verifier to check authenticity by applying the asymmetric keys algorithm and check whether the signing key is amongst the ones who have authorization permissions.

The Universal Resolver has been implemented in order to resolve a DDO relative to a did:pistis: from the Ethereum blockchain to our smart contracts deployed on the testnet. 

The DDO data structure is made of the following fields:
- context: it specifies the specification being used
- id: the DID subject of the DID Document
- publicKeys: they are are used for digital signatures, encryption and other cryptographic operations, which in turn are the basis for purposes such as authentication or establishing secure communication with service endpoints.
- delegatesMgmt: array of references to public keys which have delegates management permissions granted
- statusRegMgmt: embedded keys which have permission to act on the Credential Status Registry contract
- service endpoints: array of services linked to the subject DID
- potentially any type of permission can be added.

Different permissions are handled by means of an Ethereum address associated to a Smart Contract inheriting from the OperationExecutor interface. 
As extensively stressed out by the W3C Credentials Working Group, the DID Document does not contain any personal-identifiable information (PII).

### 3.3 Update (Replace)
It is done by updating our DID Registry Smart Contract that holds the mapping between DIDs and the relative addresses with their specific permission for that very DID.
As suggested in the spec from the W3C, Pistis supports a quorum of trusted parties to enable DID recovery. Once DID and its relative key pair is generated for a user, it is heavily recommended to the user to add two more delegates for the reasons which will be explained below. When only one delegate is owned by a user, regardless of the permissions, it is allowed for that address to add one delegate. Once two or more delegates are added for a certain service, a multi signature is needed to add another. Same rule applies for revocation of a delegate which simply consists in deleting the corresponding entry from the delegates array.
This delegation mechanism helps mitigating a scenario where the user loses access to the private key corresponding to a public key delegated of his DID or when that key is compromised. In either case, the presence of three or more delegates allows the user to ask the other delegates to revoke the compromised address. The legitimate user can then generate a new address and ask the delegates to associate it with the DID to get back control over it and fully restore his functionalities.

### 3.4 Deactivation (Revoke)
Deactivation applies in a similar manner as the Update. Indeed, it is a matter of revoking all addresses for a certain DID. This makes the DID unusable and non retrievable from that point onwards. In this case, there is no public key that can be used to authenticate the holder's identity. 

## 4. Security Considerations
Smart Contracts running on a public blockchain are quite a novel concepts. Unlike other blockchain systems (see Tezos for instance), Ethereum smart contracts are not capable of being formally verified against security vulnerabilities. Indeed, in the past this has shown to be quite an issue. We tried our best in ensuring smart contracts security by looking at a list of common attacks relevant to our contracts and see how we can mitigate or just be safe from it.
#### Re-entrancy Attacks
A Re-entrancy Attack, according to Solidity documentation [4], could be present anytime there is an interaction from a contract (A) with another contract (B) and any transfer of Ether hands over control to that contract B. This makes possible for B to call back into A before this interaction is completed. If contract A has not yet modified its internal storage, when contract B calls back A, then B could recursively call A an undefined number of times (until gas limit is not reached) drawing for example the contract A balance.
In our smart contracts we do make external calls to other contracts, but none of those handle Ether transfers. Besides that, any external call which we make is towards a contract which is known at deploying time and cannot be changed. Hence no unexpected behaviour could happen. The only call towards an unknown contract happens in the method executeOperation of MultiSigOperation. This call doesn’t handle any transfer of Ether and it is made at the end of the function, when all the internal storage update have been already made. Indeed an attacker could recursively call back our contract, but it will not be able to act maliciously.
#### Integer Overflow and Underflow
According to the Solidity documentation [4], an overflow occurs when anoperation is performed that requires a fixed size variable to store a number (or piece of data) that is outside the range of the variable’s data type. An underflow is the opposite situation. These situations are problematic when an integer variable could be set by user inputs. The only function which accepts integer variable as user input is the confirmOperation in MultiSigOperation contract. In this case the function accepts in input an uint256 as an identifier number for an operation to be confirmed, if this variable underflows or overflows there are no problems. This is because if the sender could not confirm an operation already confirmed or executed, and can not confirm an operation which is not already been submitted.
#### Denial of Service by Block Gas Limit (or startGas)
A Denial of Service by Block Gas Limit could happen when the execution of a function requires more gas than the Block Gas Limit. This could easily happen when contract functions works with unlimited size array or string. In the contracts we do make use of un-sized arrays, primarily for future extendability to allow the execution of unknown function in the execute pattern. The important thing is that we do not loop over them, and we don’t need to do that, because an Operation Executor knows always in advance which parameters it is receiving and in which position they are. Basically the array is used just as a universal container for unknown parameters, which the executor knows. 

## 5. Privacy Considerations
The ways of creating, registering and managing DIDs in DID methods are designed to provide enhanced privacy, improved anonymity and reduced correlation risk. In a SSI system as thought at Pistis, an end user has different privacy concerns rather than a well-known public entity which often becomes Issuer of credentials.

#### End User
- It is extremely important to keep personally-identifiable information (PII) off-ledger. This is what happens in Pistis.
- There is no measure used to explicitly tackle DID Correletation and Pseudonymously. Pistis simply inherits benefits and drawback of key generation of the underlying Ethereum blockchain. However, generating and using mulitple, diverse, DIDs is possible for a user who wants to improve in terms of DID Correlation. Thus, key rotation as it currently happens can be applied to DIDs as well.

#### Issuer/Verifier
When talking about organization or a public figure, putting personally identifiable information on-chain might actually be a wanted feature. Indeed, DID Correletation and Pseudonymously is not much of a concern in this case. Pistis involves the use of a Trusted Contacts Management framework by which certain DIDs can expose inforamtion about DID and the related entry that controls it.

## 6. Reference Implementations
The code at https://github.com/uino95/ssi/tree/dev/pistis/pistis-did-resolver gives a reference implementation of the Pistis DID Resolver.

#### Contract Deployments

| Network              |  Contract Name               | Address                                                                                                                                  |
| -------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Ropsten (id: 3)       | MultiSigOperation              | [0x34b1D74011F0CB67Aec7E3124FA2b7d4cBE7c639](https://ropsten.etherscan.io/address/0x34b1D74011F0CB67Aec7E3124FA2b7d4cBE7c639)            |
| Ropsten (id: 3)       | PistisDiDRegistry              | [0x21a4AC9d0636ec192198D13b898B32ca26b6d1f6](https://ropsten.etherscan.io/address/0x21a4AC9d0636ec192198D13b898B32ca26b6d1f6)            |
| Ropsten (id: 3)       | CredentialStatusRegistry       | [0x5a4DbDd84185D8a71650bA578Ca3E0cFA49AA279](https://ropsten.etherscan.io/address/0x5a4DbDd84185D8a71650bA578Ca3E0cFA49AA279)            |


## References
[1]. W3C Decentralized Identifiers (DIDs) v0.11: https://w3c-ccg.github.io/did-spec/.

[2]. uPort Ethr-DID-Resolver: https://github.com/uport-project/ethr-did.

[3]. Ethereum address generation: https://github.com/ConsenSys-Academy/ethereum-address-generator-js

[4]. Solidity Documentation: https://solidity.readthedocs.io/en/v0.5.11/security-considerations.html