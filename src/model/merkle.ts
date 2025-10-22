import { createHash } from 'crypto';

// Merkle tree implementation
export class MerkleTree {
  private leaves: string[];
  private tree: string[][];

  constructor(leaves: string[]) {
    this.leaves = [...leaves].sort(); // Sort lexicographically for deterministic ordering
    this.tree = this.buildTree();
  }

  private buildTree(): string[][] {
    const tree: string[][] = [];
    tree.push([...this.leaves]);

    let currentLevel = this.leaves;
    
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left; // Duplicate last hash if odd cardinality
        
        const combined = left + right;
        const hash = createHash('sha256').update(combined).digest('hex');
        nextLevel.push(hash);
      }
      
      tree.push(nextLevel);
      currentLevel = nextLevel;
    }
    
    return tree;
  }

  getRoot(): string {
    return this.tree[this.tree.length - 1][0];
  }

  getProof(leaf: string): string[] {
    const leafIndex = this.leaves.indexOf(leaf);
    if (leafIndex === -1) {
      throw new Error('Leaf not found in tree');
    }

    const proof: string[] = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < this.tree.length - 1; level++) {
      const currentLevel = this.tree[level];
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
      
      if (siblingIndex < currentLevel.length) {
        proof.push(currentLevel[siblingIndex]);
      }
      
      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  verifyProof(leaf: string, proof: string[], root: string): boolean {
    let hash = leaf;
    
    for (const sibling of proof) {
      const combined = hash + sibling;
      hash = createHash('sha256').update(combined).digest('hex');
    }
    
    return hash === root;
  }

  getLeaves(): string[] {
    return [...this.leaves];
  }

  getTree(): string[][] {
    return this.tree.map(level => [...level]);
  }
}

// Utility functions for Merkle operations
export const buildMerkleTree = (rowHashes: string[]): MerkleTree => {
  return new MerkleTree(rowHashes);
};

export const generateMerkleRoot = (rowHashes: string[]): string => {
  const tree = buildMerkleTree(rowHashes);
  return tree.getRoot();
};

export const generateMerkleProof = (rowHashes: string[], targetHash: string): string[] => {
  const tree = buildMerkleTree(rowHashes);
  return tree.getProof(targetHash);
};

export const verifyMerkleProof = (
  leaf: string,
  proof: string[],
  root: string
): boolean => {
  const tree = new MerkleTree([leaf]); // Create minimal tree for verification
  return tree.verifyProof(leaf, proof, root);
};
