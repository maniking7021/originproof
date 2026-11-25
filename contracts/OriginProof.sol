// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title OriginProof — on-chain content provenance registry for ME Network
/// @notice A creator registers the SHA-256 fingerprint AND the perceptual
///         hash (dHash) of a photo/video. The file itself is NEVER stored
///         on-chain — only its hashes, plus who registered it and when.
///         Anyone can re-upload the same file, recompute the hashes, and
///         verify the original registration. First registration is the
///         origin claim; later registrations of the same hash are counted
///         and flagged as copies. The perceptual hash lets anyone detect
///         near-duplicates: a resized, cropped or re-compressed copy has a
///         different SHA-256 but a nearly identical dHash.
/// @dev Built for MetaEarth Hackathon 2026: HARBOR, track "AI & Trust
///      Infrastructure". EVM-compatible (ME Network V2.0.17+).
///      Gas note: `register` stores one record (~2 SSTOREs for a new hash).
///      `registerBatch` is capped at 10 files per call so a single
///      transaction stays well within block gas limits.
///      v3 changes (23 Nov 2026): an optional `meId` field links the
///      uploader's verified MetaEarth identity (public bech32 address,
///      "me1...") to the record, so a certificate can show a verified
///      human owner instead of only a wallet address. The v3 `register`
///      / `registerBatch` take the extra `meId` argument; the v2
///      4-argument versions are kept as thin wrappers that store an
///      empty ME ID, so existing callers keep working. v3 also adds:
///      `manifestHash` + `attachManifest` (C2PA manifest anchoring),
///      `reportCopy` / `reportCount` (copy reports), and `hashAt`
///      (enumerate records for public explorers / creator pages).
///      The contract was never deployed before v3, so there is no
///      on-chain v2 data to migrate — v3 is the canonical ABI.
contract OriginProof {
    /// @notice Contract version — "3" (v3 adds the ME ID link).
    string public constant VERSION = "3";

    struct Record {
        address uploader;      // wallet that first registered this hash
        uint256 timestamp;     // block timestamp of first registration
        uint256 blockNumber;   // block of first registration
        string contentType;    // e.g. "image/jpeg", "video/mp4"
        string title;          // human-readable title given at registration
        uint256 registrations; // total times this hash was registered (>= 1)
        bytes8 perceptualHash; // 64-bit dHash of the media (0x0 = unavailable, e.g. non-image).
                               // For videos this is the consensus hash of up to 8 sampled frames.
        string meId;           // uploader's verified ME ID ("me1...", empty = not linked)
        bytes32 manifestHash;  // SHA-256 of the C2PA manifest JSON (0x0 = none attached)
    }

    /// @dev contentHash => first (origin) record. Empty uploader = never registered.
    mapping(bytes32 => Record) private _records;

    /// @dev contentHash => number of copy reports filed against it.
    mapping(bytes32 => uint256) private _copyReports;

    /// @dev All registered content hashes, in order — used by findByPhash so
    ///      near-duplicate search can run entirely on-chain (view call, no gas).
    bytes32[] private _allHashes;

    /// @dev Emitted on every registration. `isFirst` is false when the hash
    ///      was already registered before (a copy / re-registration).
    ///      `meId` is the uploader's verified ME ID at registration time
    ///      (empty when not linked).
    event ContentRegistered(
        bytes32 indexed contentHash,
        address indexed uploader,
        uint256 timestamp,
        string contentType,
        string title,
        bytes8 perceptualHash,
        bool isFirst,
        string meId
    );

    /// @dev Emitted when a C2PA manifest hash is attached to a record.
    event ManifestAttached(bytes32 indexed contentHash, bytes32 manifestHash);

    /// @dev Emitted when someone reports a suspected copy of a record.
    ///      `url` is where the suspected copy was seen (not verified).
    event CopyReported(bytes32 indexed contentHash, address indexed reporter, string url);

    /// @notice Register a media fingerprint on-chain, linked to the
    ///         uploader's verified ME ID.
    /// @param contentHash SHA-256 of the file, computed client-side (WebCrypto).
    /// @param phash 64-bit dHash of the media (0x0 when not computable).
    ///         For videos: the consensus hash of up to 8 sampled frames.
    /// @param contentType MIME type of the file, e.g. "image/jpeg".
    /// @param title Short human-readable title, e.g. "Press photo — summit".
    /// @param meId The uploader's verified ME ID ("me1...", public bech32
    ///        address). Optional — pass "" to register without linking an
    ///        ME ID. NEVER a private key, seed phrase or password.
    /// @return isFirst True when this is the first registration of the hash.
    function register(
        bytes32 contentHash,
        bytes8 phash,
        string calldata contentType,
        string calldata title,
        string calldata meId
    ) external returns (bool isFirst) {
        return _register(contentHash, phash, contentType, title, meId);
    }

    /// @notice v2-compatible register (no ME ID). Kept so callers written
    ///         against contract v2 keep working; stores an empty ME ID.
    function register(
        bytes32 contentHash,
        bytes8 phash,
        string calldata contentType,
        string calldata title
    ) external returns (bool isFirst) {
        return _register(contentHash, phash, contentType, title, "");
    }

    /// @notice Register up to 10 files in a single transaction, all linked
    ///         to the same ME ID (the uploader's verified identity).
    /// @dev Arrays must all have the same length (1..10). The call does NOT
    ///      revert if one file was already registered — that entry is counted
    ///      as a copy and its `firsts[i]` is false, so a batch never fails
    ///      because of a single duplicate.
    /// @return firsts Per-file flags: true when that file is a first registration.
    function registerBatch(
        bytes32[] calldata contentHashes,
        bytes8[] calldata phashes,
        string[] calldata contentTypes,
        string[] calldata titles,
        string calldata meId
    ) external returns (bool[] memory firsts) {
        uint256 n = contentHashes.length;
        require(n > 0 && n <= 10, "OriginProof: batch size 1..10");
        require(phashes.length == n, "OriginProof: phash length mismatch");
        require(contentTypes.length == n, "OriginProof: type length mismatch");
        require(titles.length == n, "OriginProof: title length mismatch");
        firsts = new bool[](n);
        for (uint256 i = 0; i < n; i++) {
            firsts[i] = _register(contentHashes[i], phashes[i], contentTypes[i], titles[i], meId);
        }
    }

    /// @notice v2-compatible batch register (no ME ID). Stores an empty ME ID.
    function registerBatch(
        bytes32[] calldata contentHashes,
        bytes8[] calldata phashes,
        string[] calldata contentTypes,
        string[] calldata titles
    ) external returns (bool[] memory firsts) {
        uint256 n = contentHashes.length;
        require(n > 0 && n <= 10, "OriginProof: batch size 1..10");
        require(phashes.length == n, "OriginProof: phash length mismatch");
        require(contentTypes.length == n, "OriginProof: type length mismatch");
        require(titles.length == n, "OriginProof: title length mismatch");
        firsts = new bool[](n);
        for (uint256 i = 0; i < n; i++) {
            firsts[i] = _register(contentHashes[i], phashes[i], contentTypes[i], titles[i], "");
        }
    }

    /// @notice Look up the origin record for a hash.
    /// @return record The first-registration record (uploader == address(0)
    ///         when the hash was never registered).
    function verify(bytes32 contentHash) external view returns (Record memory record) {
        return _records[contentHash];
    }

    /// @notice True when the hash has been registered at least once.
    function isRegistered(bytes32 contentHash) external view returns (bool) {
        return _records[contentHash].uploader != address(0);
    }

    /// @notice How many times a hash has been registered (0 = never).
    function registrationCount(bytes32 contentHash) external view returns (uint256) {
        return _records[contentHash].registrations;
    }

    /// @notice Total number of distinct content hashes ever registered.
    function totalRecords() external view returns (uint256) {
        return _allHashes.length;
    }

    /// @notice Content hash at a registry index (0..totalRecords()-1).
    /// @dev Lets public explorers and creator pages enumerate every
    ///      record without events. View-only, no gas.
    function hashAt(uint256 index) external view returns (bytes32) {
        require(index < _allHashes.length, "OriginProof: index out of range");
        return _allHashes[index];
    }

    /// @notice Attach the SHA-256 of a record's C2PA manifest JSON.
    /// @dev Only the original uploader can attach, and only once — the
    ///      manifest is built after registration (it contains the
    ///      registration tx hash), so attaching is a second transaction.
    ///      The manifest itself lives off-chain (downloadable sidecar);
    ///      only its hash is stored here, so anyone can check that a
    ///      sidecar file matches the on-chain record.
    function attachManifest(bytes32 contentHash, bytes32 manifestHash) external {
        Record storage rec = _records[contentHash];
        require(rec.uploader != address(0), "OriginProof: not registered");
        require(msg.sender == rec.uploader, "OriginProof: only uploader");
        require(rec.manifestHash == bytes32(0), "OriginProof: manifest already attached");
        require(manifestHash != bytes32(0), "OriginProof: empty manifest hash");
        rec.manifestHash = manifestHash;
        emit ManifestAttached(contentHash, manifestHash);
    }

    /// @notice Report a suspected copy of a registered file.
    /// @dev Anyone can report; reports are a count + an event, not a
    ///      verdict — the URL is not verified on-chain. The frontend
    ///      keeps the reported URLs locally; the chain keeps the count.
    /// @param contentHash SHA-256 of the ORIGINAL (registered) file.
    /// @param url Where the suspected copy was seen (max 300 chars).
    function reportCopy(bytes32 contentHash, string calldata url) external {
        require(_records[contentHash].uploader != address(0), "OriginProof: not registered");
        require(bytes(url).length > 0 && bytes(url).length <= 300, "OriginProof: bad url");
        _copyReports[contentHash] += 1;
        emit CopyReported(contentHash, msg.sender, url);
    }

    /// @notice How many copy reports a hash has received (0 = none).
    function reportCount(bytes32 contentHash) external view returns (uint256) {
        return _copyReports[contentHash];
    }

    /// @notice Find registered hashes whose perceptual hash is within
    ///         `maxDistance` bits (Hamming distance) of `phash`.
    /// @dev View-only: costs no gas when called off-chain. Bounded to the
    ///      first 50 matches so the return data stays small. A distance of 0
    ///      means a visually identical image; 1-10 usually means a resized,
    ///      re-compressed or lightly cropped copy; above ~16 the match is
    ///      weak and should be treated as "not the same image". For videos
    ///      the stored hash is the frame-consensus hash, so the same bands
    ///      apply.
    /// @return matches Content hashes (SHA-256) of near-duplicates, in
    ///         registration order. Call verify() on each for full details.
    function findByPhash(bytes8 phash, uint8 maxDistance) external view returns (bytes32[] memory matches) {
        require(maxDistance <= 64, "OriginProof: distance 0..64");
        bytes32[] memory found = new bytes32[](50);
        uint256 count = 0;
        uint256 total = _allHashes.length;
        for (uint256 i = 0; i < total && count < 50; i++) {
            bytes8 stored = _records[_allHashes[i]].perceptualHash;
            if (stored == bytes8(0)) continue; // no perceptual hash stored
            if (_hammingDistance(phash, stored) <= maxDistance) {
                found[count] = _allHashes[i];
                count++;
            }
        }
        matches = new bytes32[](count);
        for (uint256 j = 0; j < count; j++) matches[j] = found[j];
    }

    /// @dev Shared registration logic for register() and registerBatch().
    ///      The ME ID is stored only on first registration — later
    ///      re-registrations (copies) never overwrite the origin record.
    function _register(
        bytes32 contentHash,
        bytes8 phash,
        string calldata contentType,
        string calldata title,
        string memory meId
    ) internal returns (bool isFirst) {
        require(contentHash != bytes32(0), "OriginProof: empty hash");
        require(bytes(contentType).length > 0, "OriginProof: empty type");
        require(bytes(title).length > 0, "OriginProof: empty title");
        require(_isValidMeId(meId), "OriginProof: bad meId");

        Record storage rec = _records[contentHash];
        if (rec.uploader == address(0)) {
            rec.uploader = msg.sender;
            rec.timestamp = block.timestamp;
            rec.blockNumber = block.number;
            rec.contentType = contentType;
            rec.title = title;
            rec.registrations = 1;
            rec.perceptualHash = phash;
            rec.meId = meId;
            _allHashes.push(contentHash);
            isFirst = true;
        } else {
            rec.registrations += 1;
            isFirst = false;
        }

        emit ContentRegistered(
            contentHash,
            msg.sender,
            block.timestamp,
            contentType,
            title,
            phash,
            isFirst,
            meId
        );
    }

    /// @dev ME ID check: empty (not linked) is always allowed; otherwise
    ///      the string must look like a MetaEarth bech32 address — "me1"
    ///      prefix, 10..64 chars, lowercase letters/digits only. This is a
    ///      format check, not a bech32 checksum proof.
    function _isValidMeId(string memory meId) internal pure returns (bool) {
        bytes memory b = bytes(meId);
        if (b.length == 0) return true;
        if (b.length < 10 || b.length > 64) return false;
        if (b[0] != "m" || b[1] != "e" || b[2] != "1") return false;
        for (uint256 i = 3; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= "0" && c <= "9") || (c >= "a" && c <= "z");
            if (!ok) return false;
        }
        return true;
    }

    /// @dev Hamming distance between two 64-bit perceptual hashes.
    function _hammingDistance(bytes8 a, bytes8 b) internal pure returns (uint8) {
        uint64 x = uint64(a) ^ uint64(b);
        uint8 d = 0;
        while (x != 0) {
            d += uint8(x & 1);
            x >>= 1;
        }
        return d;
    }
}
