import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sun, Sparkles } from "lucide-react";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const presetAnswers: Record<string, string> = {
  "system size": "System size is selected based on your annual kWh usage, peak sun hours in your area, and the calculated system losses. We add a loss factor buffer to ensure your needs are met even during low-production months. The adjusted array size will always be larger than the raw calculation.",
  "battery size": "Battery size matters for off-grid and hybrid systems — it determines how long your home can run without sunlight. We size the battery bank based on your daily usage, backup hours requested, and depth of discharge (DoD) limits. LiFePO4 batteries support 80% DoD and 3,000–6,000+ cycles.",
  "losses": "Losses refer to energy lost during production and conversion. These include: shade (obstructions), temperature (panels lose efficiency in heat), dirt/soiling, wiring resistance, and the DC-to-AC conversion in the inverter. Factoring these in ensures your system isn't undersized and gives you realistic production numbers.",
  "off-grid vs grid-tied": "Grid-tied systems connect directly to the utility grid and use it as a 'virtual battery' through net metering — excess power is exported, and you draw from the grid at night. Off-grid systems are completely independent and require batteries. Hybrid systems do both: they connect to the grid but also have batteries for backup during outages.",
  "equipment": "Recommended equipment is based on your budget tier. Economy tier uses reliable cost-effective components. Mid-range uses proven industry leaders. Premium uses top-efficiency panels (400W+), premium inverters like Enphase or SolarEdge, and LiFePO4 batteries from leading brands.",
  "inverter": "The inverter converts DC power from your panels to AC power for your home. For grid-tied, string inverters or microinverters (Enphase) are common. For off-grid, an inverter/charger combo handles battery management too. We size the inverter at 125–130% of the array to handle peak production and surge loads.",
  "payback": "Payback period is the time for your solar savings to equal the installation cost. Typical residential payback is 7–14 years, depending on utility rates, system size, and your state's incentives. The federal Investment Tax Credit (ITC) at 30% significantly shortens payback — consult a tax professional.",
  "permits": "Solar installations require electrical and building permits in nearly all US jurisdictions. Your installer handles most permitting, but off-grid systems may have additional requirements. The Authority Having Jurisdiction (AHJ) must approve the design and inspect the work. This report is for planning purposes — final design must be approved by a licensed professional.",
  "maintenance": "Solar panels require very little maintenance — typically just cleaning 1-2 times per year (or after dust storms). Inverters have warranties of 10–25 years. Batteries require monitoring of state of charge and periodic equalization (lead-acid) or are largely maintenance-free (LiFePO4). A monitoring system is recommended.",
};

const CHIPS = [
  "Why was this system size selected?",
  "How does battery size affect the design?",
  "What are system losses?",
  "Off-grid vs grid-tied vs hybrid?",
  "What equipment is recommended?",
  "How long is the payback period?",
  "Do I need permits?",
];

function getAnswer(question: string): string {
  const lower = question.toLowerCase();
  for (const [key, answer] of Object.entries(presetAnswers)) {
    if (key.split(" ").some(word => lower.includes(word) && word.length > 3)) {
      return answer;
    }
  }
  return "I can help with questions about system sizing, batteries, losses, inverters, system types (off-grid/grid-tied/hybrid), equipment selection, permits, payback, and maintenance. Try one of the suggested questions above!";
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content: "Hello! I'm your OffGrid Solar Assistant. I can explain solar terminology, calculations, and report recommendations. Ask me anything or use the quick questions below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = (text?: string) => {
    const question = (text ?? input).trim();
    if (!question) return;

    const userMsg: Message = { id: Date.now(), role: "user", content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: getAnswer(question) },
      ]);
    }, 800);
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto flex flex-col gap-4" style={{ height: "calc(100dvh - 7rem)" }}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Solar Assistant
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Ask questions about solar design and terminology.</p>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-card border rounded-xl shadow-sm min-h-0">
          {/* Message area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.role === "assistant" && <Sun className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span className="font-semibold text-xs opacity-70">
                      {msg.role === "user" ? "You" : "Solar Assistant"}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center h-5">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="p-3 sm:p-4 bg-background border-t shrink-0">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => handleSend(chip)}
                  className="text-xs bg-secondary hover:bg-primary/10 hover:text-primary text-secondary-foreground px-2.5 py-1.5 rounded-full transition-colors whitespace-nowrap"
                >
                  {chip}
                </button>
              ))}
            </div>
            <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask a question about solar..."
                className="flex-1"
                disabled={isTyping}
              />
              <Button type="submit" size="icon" disabled={isTyping || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
