'use strict'

const Libp2p = require('libp2p')
const IPFS = require('ipfs')
const TCP = require('libp2p-tcp')
const MulticastDNS = require('libp2p-mdns')
const WebSocketStar = require('libp2p-websocket-star')
const WebRTCStar = require('libp2p-webrtc-star')
const Bootstrap = require('libp2p-bootstrap')
const SPDY = require('libp2p-spdy')
const KadDHT = require('libp2p-kad-dht')
const MPLEX = require('pull-mplex')
const SECIO = require('libp2p-secio')
const assert = require('assert')
const Protector = require('libp2p-pnet')

const fs = require('fs')
const path = require('path')

const repoPath = path.resolve('./tmp/custom-repo/.ipfs')
const swarmKeyPath = path.join(repoPath, 'swarm.key')


const libp2pBundle = (opts) => {

  // Set convenience variables to clearly showcase some of the useful things that are available
  const peerInfo = opts.peerInfo
  const peerBook = opts.peerBook
  const bootstrapList = opts.config.Bootstrap

  // Create our WebSocketStar transport and give it our PeerId, straight from the ipfs node
  const wsstar = new WebSocketStar({ id: peerInfo.id })
  const wrtcstar = new WebRTCStar({ id: peerInfo.id })

  // Build and return our libp2p node
  return new Libp2p({
    peerInfo,
    peerBook,

    // Lets limit the connection managers peers and have it check peer health less frequently
    connectionManager: {
      minPeers: 25,
      maxPeers: 100,
      pollInterval: 5000
    },
    modules: {
      transport: [
        TCP,
        wsstar,
        wrtcstar
      ],
      streamMuxer: [
        MPLEX,
        SPDY
      ],
      connEncryption: [
        SECIO
      ],
      peerDiscovery: [
        MulticastDNS,
        Bootstrap,
        wsstar.discovery,
        wrtcstar.discovery
      ],
      dht: KadDHT,
      //set private connector
      connProtector: new Protector(fs.readFileSync(swarmKeyPath))
    },
    config: {
      peerDiscovery: {
        autoDial: true, // auto dial to peers we find when we have less peers than `connectionManager.minPeers`
        mdns: {
          interval: 10000,
          enabled: true
        },
        bootstrap: {
          interval: 30e3,
          enabled: true,
          list: bootstrapList
        },
        websocketStar: {
          enabled: true
        },
        webRTCStar: {
          enabled: true
        }
      },
      // Turn on relay with hop active so we can connect to more peers
      relay: {
        enabled: true,
        hop: {
          enabled: true,
          active: true
        }
      },
      dht: {
        enabled: true,
        kBucketSize: 20,
        randomWalk: {
          enabled: true,
          interval: 10e3, // This is set low intentionally, so more peers are discovered quickly. Higher intervals are recommended
          timeout: 2e3 // End the query quickly since we're running so frequently
        }
      },
      EXPERIMENTAL: {
        pubsub: true
      }
    }
  })
}

// Read the swarmKey on repo  path

const mNodeAddr = '/ip4/129.211.127.83/tcp/4001/ipfs/QmXt4bwenzr8apvhE1Lkn2HjKcdT5EZppk5P1TK9rr8B9v'
// Now that we have our custom libp2p bundle, let's start up the ipfs node!
const node = new IPFS({
  libp2p: libp2pBundle,
  repo: repoPath,
  // libp2p: privateLibp2pBundle(swarmKeyPath),
  config: {
    Addresses: {
      // Set the swarm address so we dont get port collision on the nodes
      Swarm: [
        '/ip4/0.0.0.0/tcp/9101',
        '/ip4/0.0.0.0/tcp/4004/ws',
        //'/ip4/129.211.127.83/tcp/443/wss/p2p-webrtc-star',
       // '/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star'
        //'/ip4/129.211.127.83/tcp/443/wss/p2p-websocket-star'
      ]
    },
    Bootstrap: [
      '/ip4/129.211.127.83/tcp/4001/ipfs/QmXt4bwenzr8apvhE1Lkn2HjKcdT5EZppk5P1TK9rr8B9v'
    ]
  }
})

console.log('auto starting my node...')

const setBootstrap = async () => {
  console.log('setting bootstrap node...')
  // query bootsrap nodes
  await node.bootstrap.list(function (err, res) {
    console.log('query bootsrap node list :', res.Peers)
  })
  await node.bootstrap.rm(null, { all: true }, function (err, res) {
    if (err) {
      console.log(err)
    }
    console.log(res)
  })
  await node.bootstrap.add(mNodeAddr, false, function (err, res) {
    if (err) {
      console.log(err)
    }
    console.log(res)
  })

}

// Listen for the node to start, so we can log out some metrics
node.once('start', (err) => {
  assert.ifError(err, 'Should startup without issue')

  //set bootstrap nodes
  setBootstrap()
  // node.swarm.connect(mNodeAddr)
  // Lets log out the number of peers we have every 2 seconds
  setInterval(() => {
    node.swarm.peers((err, peers) => {
      if (err) {
        console.log('An error occurred trying to check our peers:', err)
        process.exit(1)
      }
      console.log(`The node now has ${peers.length} peers.`)
      console.log('Those peers are: ')
      peers.forEach(element => {
        console.log(element.addr, element.peer._idB58String);
      });
    })
  }, 1000)

  // Log out the bandwidth stats every 4 seconds so we can see how our configuration is doing
  setInterval(() => {
    node.stats.bw((err, stats) => {
      if (err) {
        console.log('An error occurred trying to check our stats:', err)
      }
      console.log(`\nBandwidth Stats: ${JSON.stringify(stats, null, 2)}\n`)
    })
  }, 4000)
})
