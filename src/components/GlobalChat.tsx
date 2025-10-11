import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { useAuthContext } from '../contexts/AuthContext';
import Card from './ui/Card';
import Input from './ui/Input';
import Button from './ui/Button';
import { loadChatHistory, saveChatHistory } from '../data/chatStore';

const CHAT_STORAGE_KEY = 'competition_global_chat';

const GlobalChat: React.FC = () => {
    const { currentUser } = useAuthContext();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const chatBodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMessages(loadChatHistory<ChatMessage>(CHAT_STORAGE_KEY));
    }, []);
    
    useEffect(() => {
        if (chatBodyRef.current) {
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUser) return;

        const message: ChatMessage = {
            id: new Date().toISOString() + Math.random(),
            userNickname: currentUser.nickname,
            userEmail: currentUser.email,
            text: newMessage.trim(),
            timestamp: new Date().toISOString()
        };
        
        const updatedMessages = [...messages, message];
        setMessages(updatedMessages);
        setNewMessage('');
        saveChatHistory(CHAT_STORAGE_KEY, updatedMessages);
    };
    
    return (
        <Card className="flex flex-col h-[calc(100vh-6rem)]">
            <h2 className="text-xl font-semibold mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">Общий чат</h2>
            <div ref={chatBodyRef} className="flex-1 overflow-y-auto pr-2 space-y-4">
                {messages.length > 0 ? messages.map(msg => {
                    const isCurrentUser = msg.userEmail === currentUser?.email;
                    return (
                        <div key={msg.id} className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                            <div className={`text-xs mb-1 ${isCurrentUser ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                {msg.userNickname}
                            </div>
                            <div className={`px-3 py-2 rounded-lg max-w-xs break-words ${isCurrentUser ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>
                                <p className="text-sm">{msg.text}</p>
                            </div>
                        </div>
                    )
                }) : (
                    <div className="text-center text-sm text-gray-500 pt-10">
                        Сообщений пока нет. Будьте первым!
                    </div>
                )}
            </div>
            <form onSubmit={handleSendMessage} className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                 <div className="flex items-center space-x-2">
                    <Input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Написать сообщение..."
                        className="flex-1"
                        disabled={!currentUser}
                    />
                    <Button type="submit" disabled={!newMessage.trim() || !currentUser}>
                        Отправить
                    </Button>
                </div>
            </form>
        </Card>
    );
};

export default GlobalChat;