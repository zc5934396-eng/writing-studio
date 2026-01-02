// frontend/src/components/Editor/nodes/ReviewNode.js

import { TextNode } from 'lexical';

export class ReviewNode extends TextNode {
  constructor(text, reviewData, key) {
    super(text, key);
    this.__reviewData = reviewData; 
  }

  static getType() { return 'review-highlight'; }

  static clone(node) {
    return new ReviewNode(node.getTextContent(), node.__reviewData, node.__key);
  }

  createDOM(config) {
    const dom = super.createDOM(config);
    const { type } = this.__reviewData;
    
    // --- STYLE BARU (HIGH CONTRAST) ---
    // Pakai background solid tapi soft, teks gelap biar kontras
    let className = 'cursor-pointer px-1 rounded mx-0.5 font-medium transition-all ';
    
    if (type === 'critical') {
        // Merah Jelas (Kritik Fatal)
        className += 'bg-[#FF4D4D] text-white border-b-2 border-[#990000]'; 
    } else if (type === 'citation') {
        // Biru Jelas (Butuh Ref)
        className += 'bg-[#3399FF] text-white border-b-2 border-[#0047b3]';
    } else {
        // Kuning Jelas (Saran)
        className += 'bg-[#FFCC00] text-black border-b-2 border-[#997a00]';
    }

    dom.className = className;
    dom.dataset.review = JSON.stringify(this.__reviewData);
    
    return dom;
  }

  updateDOM(prevNode, dom, config) {
    return false; 
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      reviewData: this.__reviewData,
      type: 'review-highlight',
      version: 1,
    };
  }

  static importJSON(serializedNode) {
    // eslint-disable-next-line no-use-before-define
    const node = $createReviewNode(serializedNode.text, serializedNode.reviewData);
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }
}

export function $createReviewNode(text, reviewData) {
  return new ReviewNode(text, reviewData);
}

export function $isReviewNode(node) {
  return node instanceof ReviewNode;
}