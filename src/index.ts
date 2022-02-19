import { Field, SmartContract, state, State, method, UInt64, Poseidon, Mina, PrivateKey, Party, isReady, shutdown } from 'snarkyjs';
import * as IPFS from 'ipfs';
import OrbitDB from 'orbit-db';

let treeDepth = 2;

// go back and maybe organise things into objects
// make types for OrbitDB and turn strick mode back on for tsc
// make merkle tree index from 0

await isReady;
// Mina circuit

export default class Merkle extends SmartContract {
  @state(Field) root = State<Field>();

  // initialization
  deploy(initialBalance: UInt64) {
    super.deploy();
    this.balance.addInPlace(initialBalance);
  }

  @method async getMerkleRoot(
    leaf: Field,              // value of leaf node in question
    path_values: Field[],     // array of proof values 
    path_positions: Field[]   // binary vector (0 => lhs, 1 => rhs)
  ) {

    let merkleRoot = [];

    merkleRoot[0] = Poseidon.hash([
      leaf.sub(path_positions[0].mul(leaf.sub(path_values[0]))),  // Are bitwise operations efficient? (XOR => Poseidon can remove path_positions maybe). Can I do field addition?
      path_values[0].sub(path_positions[0].mul(path_values[0].sub(leaf)))]);

    for (let i = 1; i < treeDepth; i++) {
      merkleRoot[i] = Poseidon.hash([
        merkleRoot[i - 1].sub(path_positions[i].mul(merkleRoot[i - 1].sub(path_values[i]))),
        path_values[i].sub(path_positions[i].mul(path_values[i].sub(merkleRoot[i - 1])))]);
    }
    return merkleRoot[treeDepth - 1];
  }
}

// Setup local Mina
const Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);
const account1 = Local.testAccounts[0].privateKey;
const account2 = Local.testAccounts[1].privateKey;

const snappPrivkey = PrivateKey.random();
let snappAddress = snappPrivkey.toPublicKey();

async function deploy() {
  let tx = Mina.transaction(account1, async () => {
    const initialBalance = UInt64.fromNumber(1000000);
    const p = await Party.createSigned(account2);
    p.balance.subInPlace(initialBalance);
    let snapp = new Merkle(snappAddress);
    snapp.deploy(initialBalance);
  });
  await tx.send().wait();
}

// Initialize IPFS and OrbitDB

const ipfsOptions = { repo: './ipfs', };
const ipfs = await IPFS.create(ipfsOptions);

const orbitdb = await OrbitDB.createInstance(ipfs);

const db = await orbitdb.keyvalue('merkel-tree');

for (let i = 1; i <= Math.pow(treeDepth, 2); i++) {
  await putValue(i, 0);
}

// Client

async function oneLevel(layer) {
  let result = [];
  let leaves = [...layer];

  for (let i = 0; i < leaves.length; i+=2) {
    result.push(Poseidon.hash([new Field(leaves[i]), new Field(leaves[i + 1])]));
  }

  return result;
}

async function getRoot() {
  let values = [];

  for (let i = 1; i <= Math.pow(treeDepth, 2); i++) {
    let value = await db.get(i.toString());
    values.push(value);
  }

  while(values.length > 1) {
    values = await oneLevel(values);
  }

  return values[0];
}

// add BigInt support for value
async function putValue(index: number, value: number) {
  await db.put(index.toString(), value);
  let root = await getRoot();

}

async function getValue(index: number) {

}

// Run stuff

await deploy();

await putValue(1, 5);
await putValue(2, 6);
await putValue(3, 7);
await putValue(4, 8);


let root = await getRoot()
console.log(root);

shutdown();
