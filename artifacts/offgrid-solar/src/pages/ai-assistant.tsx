import { AppLayout } from "@/components/layout/AppLayout";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Sun, Sparkles } from "lucide-react";

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      content: "Hello! I'm your OffGrid Solar Assistant. I can help explain solar terminology, calculations, and recommendations. What would you like to know?"
    }
  ]);
  const [input, setInput] = useState("");

  const presetAnswers: Record<string, string> = {
    "system size": "System size is selected based on your annual kWh usage, peak sun hours in your area, and the calculated system losses. We add a buffer to ensure your needs are met even during low-production months.",
    "battery size": "Battery size matters for off-grid and hybrid systems because it determines how long your home can run without sunlight. We size the battery bank based on your daily usage, backup goals, and depth of discharge (DoD) limits to prolong battery life.",
    "losses": "Losses refer to the energy lost during production and conversion. These include shade, temperature (panels are less efficient when hot), dirt, wiring resistance, and the DC-to-AC conversion process in the inverter. Factoring these in ensures your system isn't undersized.",
    "off-grid vs grid-tied": "Grid-tied systems connect directly to the utility grid, using it as a giant battery to store excess power (net metering) and pull from it when needed. Off-grid systems are completely independent and require batteries. Hybrid systems do both: they connect to the grid but have batteries for backup during outages.",
    "equipment": "Our recommended equipment is based on your budget tier. We suggest industry-leading brands known for reliability, warranty terms, and performance in varying conditions."
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage = { id: Date.now(), role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");

    // Simulate AI delay
    setTimeout(() => {
      let matchedAnswer = "I'm not sure I understand. Try asking about system sizing, batteries, losses, system types, or equipment recommendations.";
      
      const lowerInput = userMessage.content.toLowerCase();
      for (const [key, answer] of Object.entries(presetAnswers)) {
        if (lowerInput.includes(key.split(' ')[0])) {
          matchedAnswer = answer;
          break;
        }
      }

      setMessages(prev => [...prev, { id: Date.now(), role: "assistant", content: matchedAnswer }]);
    }, 1000);
  };

  const handleChipClick = (question: string) => {
    setInput(question);
    // Optionally auto-send
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            AI Solar Assistant
          </h1>
          <p className="text-muted-foreground mt-1">Ask questions about solar design and terminology.</p>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-card border rounded-lg shadow-sm">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {msg.role === "assistant" && <Sun className="h-4 w-4" />}
                    <span className="font-semibold text-xs opacity-80">
                      {msg.role === "user" ? "You" : "Assistant"}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-background border-t">
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                "Why was this system size selected?",
                "Why does battery size matter?",
                "What do losses mean?",
                "Off-grid vs grid-tied vs hybrid",
                "What equipment is recommended?"
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  className="text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground px-3 py-1.5 rounded-full transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about solar..."
                className="flex-1"
              />
              <Button type="submit" size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
