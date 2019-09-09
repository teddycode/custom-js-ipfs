'use strict'

const Libp2p = require('libp2p')
const IPFS = require('ipfs')
const wrtc = require('wrtc')
const TCP = require('libp2p-tcp')
const MulticastDNS = require('libp2p-mdns')
const WebSocketStar = require('libp2p-websocket-star')
const WebRTCStar = require('libp2p-webrtc-star')
const Bootstrap = require('libp2p-bootstrap')
const SPDY = require('libp2p-spdy')
const KadDHT = require('libp2p-kad-dht')
const MPLEX = require('pull-mplex')
const SECIO = require('libp2p-secio')
const Protector = require('libp2p-pnet')
const GossipSub = require('libp2p-gossipsub')

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
  const wrtcstar = new WebRTCStar({ wrtc })

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
      pubsub: GossipSub,
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
          enabled: false,
          interval: 10e3, // This is set low intentionally, so more peers are discovered quickly. Higher intervals are recommended
          timeout: 2e3 // End the query quickly since we're running so frequently
        }
      },
      pubsub: {
        enabled: true,
        emitSelf: true,      // whether the node should emit to self on publish, in the event of the topic being subscribed
        signMessages: true,  // if messages should be signed
        strictSigning: true  // if message signing should be required
      }
    }
  })
}

var node = ''
// Now that we have our custom libp2p bundle, let's start up the ipfs node!
const readyToBoost = async () => {
  node = new IPFS({
    libp2p: libp2pBundle,
    repo: repoPath,
    config: {
      Addresses: {
        // Set the swarm address so we dont get port collision on the nodes
        Swarm: [
          '/ip4/0.0.0.0/tcp/9101',
          '/dns4/guetdcl.cn/tcp/4433/wss/p2p-websocket-star/'
        ]
      },
      Bootstrap: [
        '/dns4/guetdcl.cn/tcp/8082/wss/ipfs/QmXt4bwenzr8apvhE1Lkn2HjKcdT5EZppk5P1TK9rr8B9v'
      ]
    }
  })
  await node.ready
}

readyToBoost()

console.log('my node started!')

//we can log out some metrics
var pcnt = 0; var mcnt = 0;
const logNodeMsg = () => {
  // Lets log out the number of peers we have every n seconds
  const interval1 = setInterval(() => {
    node.swarm.peers((err, peers) => {
      if (err) {
        console.log('An error occurred trying to check our peers:', err)
        process.exit(1)
      }
      console.log(`The node now has ${peers.length} peers.`)
      peers.forEach(element => {
        console.log(element.peer._idB58String)
      });
    })
    if (++pcnt > 2000) {
      clearInterval(interval1)
      console.log('peers logout stoped, my node is still running!')
      getFile(hash)
    }
  }, 5000)

  // Log out the bandwidth stats every 4 seconds so we can see how our configuration is doing
  const interval2 = setInterval(() => {
    node.stats.bw((err, stats) => {
      if (err) {
        console.log('An error occurred trying to check our stats:', err)
      }
      console.log(`\nBandwidth Stats: ${JSON.stringify(stats, null, 2)}\n`)
    })
    if (++mcnt > 5) {
      clearInterval(interval2)
      console.log('bandwidth logout stoped, node is still running')
    }
  }, 10000)
}


logNodeMsg()

var filesPath = path.resolve('./getFiles')
var hash = 'QmVDTuLs8a4PZsHZgYKMKDTJRnnyYU7WdB8Vbi9tfFrL6o'
const getFile = (hash) => {
  node.get(hash)
    .then((files) => {
      files.forEach((file) => {
        if (file.content) {
          console.log('Getting file:', file.name)
          let filePath = path.resolve(filesPath, file.name)
          fs.open(filePath, 'w', function (err, fd) {
            if (err) {
              console.log('ERR:', err, file.name, ' can not be save!');
            }
            fs.writeFile(fd, file.content, function (err) {
              console.log('File write error: ', err)
            })
          })
        }
      })
    })
}




