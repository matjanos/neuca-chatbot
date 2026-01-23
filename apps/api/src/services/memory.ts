import type { ModelMessage } from 'ai';
import type { Conversation } from '../types.js';

/** In-memory conversation store */
const conversations = new Map<string, Conversation>();

/** Generate a UUID */
function generateId(): string {
  return crypto.randomUUID();
}

/** Get a conversation by ID, or create a new one */
export function getOrCreate(id?: string): Conversation {
  if (id && conversations.has(id)) {
    return conversations.get(id)!;
  }

  const newId = id || generateId();
  const conversation: Conversation = {
    id: newId,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  conversations.set(newId, conversation);
  return conversation;
}

/** Add a message to a conversation */
export function addMessage(conversationId: string, message: ModelMessage): void {
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  conversation.messages.push(message);
  conversation.updatedAt = new Date();
}

/** Get conversation history */
export function getHistory(conversationId: string): ModelMessage[] {
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    return [];
  }
  return conversation.messages;
}

/** Set lecture title for a conversation */
export function setLectureTitle(conversationId: string, title: string): void {
  const conversation = conversations.get(conversationId);
  if (conversation) {
    conversation.lectureTitle = title;
    conversation.updatedAt = new Date();
  }
}

/** Get lecture title for a conversation */
export function getLectureTitle(conversationId: string): string | undefined {
  return conversations.get(conversationId)?.lectureTitle;
}

/** Delete a conversation */
export function deleteConversation(conversationId: string): boolean {
  return conversations.delete(conversationId);
}

/** Get all conversation IDs (for debugging) */
export function listConversations(): string[] {
  return Array.from(conversations.keys());
}
