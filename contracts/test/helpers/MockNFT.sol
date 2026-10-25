// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

library Base64 {
    string internal constant _TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function encode(bytes memory data) internal pure returns (string memory) {
        uint256 len = data.length;
        if (len == 0) return "";
        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen);
        bytes memory table = bytes(_TABLE);
        uint256 i;
        uint256 j;
        for (i = 0; i + 2 < len; i += 3) {
            result[j++] = table[uint8(data[i]) >> 2];
            result[j++] = table[((uint8(data[i]) & 3) << 4) | (uint8(data[i + 1]) >> 4)];
            result[j++] = table[((uint8(data[i + 1]) & 15) << 2) | (uint8(data[i + 2]) >> 6)];
            result[j++] = table[uint8(data[i + 2]) & 63];
        }
        if (i < len) {
            result[j++] = table[uint8(data[i]) >> 2];
            if (i + 1 < len) {
                result[j++] = table[((uint8(data[i]) & 3) << 4) | (uint8(data[i + 1]) >> 4)];
                result[j++] = table[(uint8(data[i + 1]) & 15) << 2];
            } else {
                result[j++] = table[(uint8(data[i]) & 3) << 4];
                result[j++] = bytes1(0x3d);
            }
            result[j++] = bytes1(0x3d);
        }
        return string(result);
    }
}

contract MockNFT {
    string public name = "Mock NFT";
    string public symbol = "MNFT";

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function mint(address to, uint256 tokenId) external {
        require(to != address(0), "INVALID_RECIPIENT");
        require(_owners[tokenId] == address(0), "ALREADY_MINTED");

        _owners[tokenId] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "NONEXISTENT_TOKEN");
        return owner;
    }

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "ZERO_ADDRESS");
        return _balances[owner];
    }

    function approve(address to, uint256 tokenId) external {
        address owner = _owners[tokenId];
        require(msg.sender == owner || _operatorApprovals[owner][msg.sender], "NOT_AUTHORIZED");
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public virtual {
        address owner = _owners[tokenId];
        require(owner == from, "WRONG_FROM");
        require(to != address(0), "ZERO_TO");
        require(
            msg.sender == owner ||
            _tokenApprovals[tokenId] == msg.sender ||
            _operatorApprovals[owner][msg.sender],
            "NOT_AUTHORIZED"
        );

        delete _tokenApprovals[tokenId];
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function tokenURI(uint256 tokenId) external pure returns (string memory) {
        bytes32 h = keccak256(abi.encodePacked("DESCENT_TOKEN", tokenId));
        uint256 hue1 = (uint256(uint8(h[0])) * 360) / 256;
        uint256 hue2 = (uint256(uint8(h[1])) * 360) / 256;
        uint256 hue3 = (uint256(uint8(h[2])) * 360) / 256;

        uint256 size1 = 80 + (uint256(uint8(h[3])) * 140) / 256;
        uint256 size2 = 60 + (uint256(uint8(h[4])) * 120) / 256;

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">',
            '<rect width="400" height="400" fill="hsl(', vmToString(hue1), ',65%,20%)"/>',
            '<rect x="50" y="50" width="', vmToString(size1), '" height="', vmToString(size1), '" fill="hsl(', vmToString(hue2), ',85%,60%)" opacity="0.8"/>',
            '<rect x="180" y="160" width="', vmToString(size2), '" height="', vmToString(size2), '" fill="hsl(', vmToString(hue3), ',90%,70%)" opacity="0.7"/>',
            '</svg>'
        );

        string memory imageUri = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));

        string memory json = string.concat(
            '{"name":"Mock NFT #', vmToString(tokenId),
            '","description":"Generative Mock NFT for Descent","image":"',
            imageUri,
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function vmToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            // forge-lint: disable-next-line(unsafe-typecast)
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
