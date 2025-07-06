// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract GeoShapes is ERC721Enumerable, Ownable, ReentrancyGuard {
    // Dynamic Pricing
    uint256 public currentPrice = 0.0001 ether;
    uint256 public priceIncrement = 0.00001 ether;
    uint256 public constant PRICE_INCREASE_THRESHOLD = 100;

    // Color palettes for the art
    string[] private colors = [
        "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", 
        "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"
    ];
    
    // Events
    event PriceUpdated(uint256 newPrice);
    event PriceConfigUpdated(uint256 newBasePrice, uint256 newIncrement);

    constructor() ERC721("Address Fingerprints", "APRINT") Ownable(msg.sender) {
        _mint(msg.sender, 0);
    }

    function updatePrice(uint256 newBasePrice, uint256 newIncrement) external onlyOwner {
        currentPrice = newBasePrice;
        priceIncrement = newIncrement;
        emit PriceConfigUpdated(newBasePrice, newIncrement);
    }

    function getTokensOfOwner(address owner) external view returns (uint256[] memory) {
        uint256 tokenCount = balanceOf(owner);
        uint256[] memory tokens = new uint256[](tokenCount);
        
        for(uint256 i = 0; i < tokenCount; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
        }
        
        return tokens;
    }

    function mint() external payable nonReentrant {
        uint256 tokenId = totalSupply();
        require(msg.value == currentPrice, "Incorrect price");
        require(tokenId < 10_000, "Max supply reached");
        
        _mint(msg.sender, tokenId);
        
        if (tokenId % PRICE_INCREASE_THRESHOLD == 0 && tokenId > 0) {
            currentPrice += priceIncrement;
            emit PriceUpdated(currentPrice);
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenId < totalSupply(), "Token doesn't exist");
        string memory json = _generateMetadataJSON(tokenId);
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _generateMetadataJSON(uint256 tokenId) internal view returns (string memory) {
        address minter = _findMinterByTokenId(tokenId);
        (string memory primaryColor, string memory secondaryColor) = _getColors(minter);
        
        string memory attributes = string(abi.encodePacked(
            '{"trait_type": "Complexity", "value": "', Strings.toString(_getComplexity(minter)), '"},',
            '{"trait_type": "Primary Color", "value": "', primaryColor, '"},',
            '{"trait_type": "Secondary Color", "value": "', secondaryColor, '"}'
        ));

        string memory imageData = Base64.encode(generateAddressArt(minter, tokenId));
        
        return string(abi.encodePacked(
            '{"name": "Address Fingerprint #',
            Strings.toString(tokenId),
            '","description": "Unique artistic representation of Ethereum addresses", ',
            '"attributes": [',
            attributes,
            '], "image": "data:image/svg+xml;base64,',
            imageData,
            '"}'
        ));
    }

    function _findMinterByTokenId(uint256 tokenId) internal view returns (address) {
        address tokenOwner = ownerOf(tokenId);
        require(tokenOwner != address(0), "Token ownership mismatch");
        return tokenOwner;
    }

    function generateAddressArt(address minter, uint256 tokenId) internal pure returns (bytes memory) {
        // Convert address to points for the path
        uint256 seed = uint256(keccak256(abi.encodePacked(minter, tokenId)));
        string memory pathData = _generatePathFromAddress(minter, seed);
        
        return abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="-1024 -1024 2048 2048">',
            '<defs>',
            _generateGradients(minter),
            '<filter id="glow"><feGaussianBlur stdDeviation="15" result="coloredBlur"/>',
            '<feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '</defs>',
            '<rect width="2048" height="2048" x="-1024" y="-1024" fill="url(#bg)"/>',
            '<g filter="url(#glow)" transform="scale(0.8)">',
            '<path d="', pathData, '" fill="none" stroke="url(#stroke)" stroke-width="8"/>',
            '</g>',
            '<text text-anchor="middle" x="0" y="900" fill="white" font-family="Arial" font-size="60">',
            _truncateAddress(minter),
            '</text>',
            '</svg>'
        );
    }

    function _generatePathFromAddress(address addr, uint256 seed) internal pure returns (string memory) {
        bytes20 addrBytes = bytes20(addr);
        string memory path = "M";
        
        // Generate initial point
        int256 x = int256(uint256(uint8(addrBytes[0]))) * 8 - 128;
        int256 y = int256(uint256(uint8(addrBytes[1]))) * 8 - 128;
        path = string(abi.encodePacked(path, Strings.toString(uint(x)), ",", Strings.toString(uint(y))));

        // Generate curve commands using address bytes
        for (uint i = 2; i < 20; i += 3) {
            x = int256(uint256(uint8(addrBytes[i]))) * 8 - 128;
            y = int256(uint256(uint8(addrBytes[i + 1 < 20 ? i + 1 : i]))) * 8 - 128;
            int256 cx = int256(uint256(uint8(addrBytes[i + 2 < 20 ? i + 2 : i]))) * 8 - 128;
            
            path = string(abi.encodePacked(
                path,
                " Q", Strings.toString(uint(cx)), ",", Strings.toString(uint(cx)),
                " ", Strings.toString(uint(x)), ",", Strings.toString(uint(y))
            ));
        }

        // Close the path
        return string(abi.encodePacked(path, " Z"));
    }

    function _generateGradients(address addr) internal pure returns (string memory) {
        bytes20 addrBytes = bytes20(addr);
        
        return string(abi.encodePacked(
            '<radialGradient id="bg" cx="50%" cy="50%" r="50%">',
            '<stop offset="0%" style="stop-color:#1a1a2e"/>',
            '<stop offset="100%" style="stop-color:#16213e"/>',
            '</radialGradient>',
            '<linearGradient id="stroke" x1="0%" y1="0%" x2="100%" y2="100%">',
            '<stop offset="0%" style="stop-color:#', _byteToColor(addrBytes[0]), '"/>',
            '<stop offset="50%" style="stop-color:#', _byteToColor(addrBytes[10]), '"/>',
            '<stop offset="100%" style="stop-color:#', _byteToColor(addrBytes[19]), '"/>',
            '</linearGradient>'
        ));
    }

    function _byteToColor(bytes1 b) internal pure returns (string memory) {
        uint8 value = uint8(b);
        bytes memory buffer = new bytes(6);
        bytes memory HEX = "0123456789ABCDEF";
        
        buffer[0] = HEX[uint(value >> 4) & 0x0F];
        buffer[1] = HEX[uint(value) & 0x0F];
        buffer[2] = HEX[uint(value >> 2) & 0x0F];
        buffer[3] = HEX[uint(value >> 6) & 0x0F];
        buffer[4] = HEX[uint(value >> 1) & 0x0F];
        buffer[5] = HEX[uint(value >> 3) & 0x0F];
        
        return string(buffer);
    }

    function _truncateAddress(address addr) internal pure returns (string memory) {
        bytes memory addressBytes = abi.encodePacked(addr);
        bytes memory result = new bytes(13);
        
        // Copy first 6 chars
        for(uint i = 0; i < 6; i++) {
            result[i] = addressBytes[i + 2]; // skip 0x
        }
        
        // Add ...
        result[6] = '.';
        result[7] = '.';
        result[8] = '.';
        
        // Copy last 4 chars
        for(uint i = 0; i < 4; i++) {
            result[i + 9] = addressBytes[addressBytes.length - 4 + i];
        }
        
        return string(result);
    }

    function _getColors(address addr) internal view returns (string memory primaryColor, string memory secondaryColor) {
        uint256 colorSeed = uint256(keccak256(abi.encodePacked(addr)));
        primaryColor = colors[colorSeed % colors.length];
        secondaryColor = colors[(colorSeed >> 128) % colors.length];
        
        // Ensure colors are different
        if (keccak256(abi.encodePacked(primaryColor)) == keccak256(abi.encodePacked(secondaryColor))) {
            secondaryColor = colors[(colorSeed % colors.length + 1) % colors.length];
        }
    }

    function _getComplexity(address addr) internal pure returns (uint256) {
        return uint256(uint8(bytes20(addr)[0])) % 10 + 1; // 1-10 complexity score
    }

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool sent,) = payable(owner()).call{value: balance}("");
        require(sent, "Transfer failed");
    }
}
