// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {GeoShapes} from "../src/GeoShapes.sol";

contract UpdatePrice is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        GeoShapes shapes = GeoShapes(0xaF76fDb407c3187af5414D55f7953bb3a4b52dEe);
        
        // Update price to 0.0001 ether and price increment to 0.00001 ether
        shapes.updatePrice(0.0001 ether, 0.00001 ether);

        vm.stopBroadcast();
    }
}
