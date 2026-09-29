const MODULES = [];

function add(unit, unitTitle, id, title, teach, py, java, c, focus = "") {
  MODULES.push({
    unit,
    unitTitle,
    id,
    title,
    focus,
    teach,
    code: {
      python: py.endsWith("\n") ? py : `${py}\n`,
      java: java.endsWith("\n") ? java : `${java}\n`,
      c: c.endsWith("\n") ? c : `${c}\n`,
    },
  });
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return String(text).replace(/^\n/, "").replace(/\s+$/, "").split("\n")
    .map((line) => (line.trim() ? pad + line : ""))
    .join("\n");
}

function J(main, methods = "", imports = []) {
  const src = `${main}\n${methods}`;
  const auto = [];
  if (/\bScanner\b/.test(src)) auto.push("java.util.Scanner");
  if (/\bArrayList\b/.test(src)) auto.push("java.util.ArrayList");
  if (/\bList\b/.test(src)) auto.push("java.util.List");
  if (/\bMap\b/.test(src)) auto.push("java.util.Map");
  if (/\bHashMap\b/.test(src)) auto.push("java.util.HashMap");
  if (/\bArrays\b/.test(src)) auto.push("java.util.Arrays");
  if (/\bRandom\b/.test(src)) auto.push("java.util.Random");
  if (/\bQueue\b/.test(src)) auto.push("java.util.Queue");
  if (/\bArrayDeque\b/.test(src)) auto.push("java.util.ArrayDeque");
  const all = [...new Set([...imports, ...auto])];
  const head = all.length ? `${all.map((item) => `import ${item};`).join("\n")}\n\n` : "";
  const extra = methods.trim() ? `\n${indent(methods, 4)}\n` : "";
  return `${head}public class Guide {\n    public static void main(String[] args) {\n${indent(main, 8)}\n    }\n${extra}}\n`;
}

function C(main, helpers = "", includes = ["stdio.h"]) {
  const extra = helpers.trim() ? `\n${helpers.trim()}\n` : "";
  return `${includes.map((item) => `#include <${item}>`).join("\n")}\n${extra}\nint main() {\n${indent(main, 4)}\n    return 0;\n}\n`;
}

const U1 = "Sequential Code";
const U2 = "Multi-Step Processing";
const U3 = "Toolbox Testing";
const U4 = "Functions";
const U5 = "Recursion";
const U6 = "Classes and Objects";
const U7 = "Inheritance and Data Structures";
const U8 = "Graphs";
const U9 = "Input/Output";
const U10 = "Multithreading";
const U11 = "Servers";

add(1, U1, "introduction", "Introduction", {
  say: "A program is a list of instructions the computer follows from top to bottom. It does not guess what you meant.",
  goal: "Read a three-line program and predict the output before running it.",
  steps: [
    "Write three print lines on the board in the wrong order. Ask what the computer will do.",
    "Have them type the lines themselves, run, then swap two lines and run again.",
    "Ask them to point at the line that ran first, second, and third.",
  ],
  watch: "They often think the computer runs the 'important' line first. Make them trace with a finger.",
  done: "They can reorder the lines to change the story and explain why, without you touching the keyboard.",
}, `print("First, the computer starts at the top.")
print("Then it does the next line.")
print("It stops at the bottom.")
`, J(`System.out.println("First, the computer starts at the top.");
System.out.println("Then it does the next line.");
System.out.println("It stops at the bottom.");`), C(`printf("First, the computer starts at the top.\\n");
printf("Then it does the next line.\\n");
printf("It stops at the bottom.\\n");`));

add(1, U1, "printing", "Printing", {
  say: "Print means show this text. The quotes are the box the words live in. Without quotes, the computer looks for a name.",
  goal: "Print three different messages, including one blank line.",
  steps: [
    "Start with one print. Have them change the words before adding a second line.",
    "Show a blank print as a pause between two sentences.",
    "In Java and C, point at println versus printf and the newline. In Python, print already ends the line.",
  ],
  watch: "Missing quotes, a capital Print, and in C a missing \\n so the next line sticks to this one.",
  done: "They can add a new sentence in the middle and predict exactly where it will appear.",
}, `print("TeachForth")
print()
print("Today we print on purpose.")
`, J(`System.out.println("TeachForth");
System.out.println();
System.out.println("Today we print on purpose.");`), C(`printf("TeachForth\\n");
printf("\\n");
printf("Today we print on purpose.\\n");`));

add(1, U1, "hello-world", "Hello World", {
  say: "The computer only prints what you put in quotes. Change the words and run it again.",
  goal: "Print Hello, World! exactly once, then change World to their name.",
  steps: [
    "Do not paste this. Have them type the one line.",
    "Run it. If it fails, point at the quote or the semicolon. Do not fix it for them.",
    "Ask them to change World to their name and say the new output before they run.",
  ],
  watch: "Hello World without a comma is fine if they chose it. The bug to catch is a missing quote, not style.",
  done: "They can change the message and predict the output before running.",
}, `print("Hello, World!")
`, J(`System.out.println("Hello, World!");`), C(`printf("Hello, World!\\n");`));

add(1, U1, "biography", "Biography", {
  say: "A biography is just several prints in an order a person can read. The computer will not organize it for you.",
  goal: "Print a four-line biography: name, city, one interest, and one goal.",
  steps: [
    "Have them say the four facts out loud before typing.",
    "Each fact is its own print. Labels like Name: are text, not a special command.",
    "Ask a partner to read only the output and tell you one fact. If they cannot, a line is missing or smashed together.",
  ],
  watch: "They try to print variables before they have learned variables. Stay with quoted text today.",
  done: "Someone else can read the output and retell the biography without seeing the code.",
}, `print("Name: Sam")
print("City: Greenwich")
print("Interest: building small games")
print("Goal: teach a friend one program")
`, J(`System.out.println("Name: Sam");
System.out.println("City: Greenwich");
System.out.println("Interest: building small games");
System.out.println("Goal: teach a friend one program");`), C(`printf("Name: Sam\\n");
printf("City: Greenwich\\n");
printf("Interest: building small games\\n");
printf("Goal: teach a friend one program\\n");`));

add(1, U1, "calculator-1", "Calculator Part 1", {
  say: "The computer can do the arithmetic. Your job is to ask for two numbers and print the sum.",
  goal: "Read two integers and print their sum. No other operations yet.",
  steps: [
    "On paper, write input, input, add, print. Have them match each step to a line.",
    "Use whole numbers only. Integer division comes later.",
    "In Java, read a whole line and parse it. nextInt leaves a newline that will bite them in the next lesson.",
    "In C, scanf needs the &. That is the lesson, not a footnote.",
  ],
  watch: "Adding the text '2' and '3' instead of the numbers. In Python, int() is required. In Java, parseInt. In C, %d.",
  done: "They can change the prompt and still get 2 + 3 = 5 without your help.",
}, `a = int(input("First number: "))
b = int(input("Second number: "))
print(a + b)
`, J(`Scanner in = new Scanner(System.in);
System.out.print("First number: ");
int a = Integer.parseInt(in.nextLine().trim());
System.out.print("Second number: ");
int b = Integer.parseInt(in.nextLine().trim());
System.out.println(a + b);`), C(`int a, b;
printf("First number: ");
scanf("%d", &a);
printf("Second number: ");
scanf("%d", &b);
printf("%d\\n", a + b);`));

add(1, U1, "mad-libs", "Mad Libs", {
  say: "Input saves a word so you can use it later. The story is just prints with those words dropped in.",
  goal: "Ask for a noun, a verb, and a place, then print a two-sentence story that uses all three.",
  steps: [
    "Write the story on the board with blanks. Then replace each blank with a variable.",
    "Run it once with silly words so they see the story change without the print lines changing.",
    "Python f-strings, Java +, and C %s are the same idea: a hole in the text.",
  ],
  watch: "They rewrite the story for each new word instead of storing the word. Also, in C, the buffer must be big enough. 32 characters is enough for this lesson.",
  done: "A second run with new words produces a new story and they did not edit the print lines.",
}, `noun = input("Noun: ")
verb = input("Verb: ")
place = input("Place: ")
print(f"The {noun} wanted to {verb}.")
print(f"So it went to the {place}.")
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Noun: ");
String noun = in.nextLine();
System.out.print("Verb: ");
String verb = in.nextLine();
System.out.print("Place: ");
String place = in.nextLine();
System.out.println("The " + noun + " wanted to " + verb + ".");
System.out.println("So it went to the " + place + ".");`), C(`char noun[32], verb[32], place[32];
printf("Noun: ");
scanf("%31s", noun);
printf("Verb: ");
scanf("%31s", verb);
printf("Place: ");
scanf("%31s", place);
printf("The %s wanted to %s.\\n", noun, verb);
printf("So it went to the %s.\\n", place);`, "", ["stdio.h"]));

add(1, U1, "conditionals", "Conditionals", {
  say: "If is a fork. The computer takes one road. It does not take both.",
  goal: "Ask for a number and print different text when it is negative, zero, or positive.",
  steps: [
    "Draw two arrows on the board. Cover one with your hand and ask which print can run.",
    "Have them test -1, 0, and 1. Three runs, not one.",
    "Only after those work, let them add a second condition.",
  ],
  watch: "Using = instead of == in Java and C. In Python, elif not else if. They also forget the case they did not test.",
  done: "They can point at the one line that ran for the input they just typed.",
}, `n = int(input("Number: "))
if n < 0:
    print("negative")
elif n == 0:
    print("zero")
else:
    print("positive")
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Number: ");
int n = Integer.parseInt(in.nextLine().trim());
if (n < 0) {
    System.out.println("negative");
} else if (n == 0) {
    System.out.println("zero");
} else {
    System.out.println("positive");
}`), C(`int n;
printf("Number: ");
scanf("%d", &n);
if (n < 0) {
    printf("negative\\n");
} else if (n == 0) {
    printf("zero\\n");
} else {
    printf("positive\\n");
}`));

add(1, U1, "quiz-game", "Quiz Game", {
  say: "A quiz is a question, a stored answer, and an if that compares them. The score is a number you add to.",
  goal: "Ask two questions, check the answers, and print the score out of 2.",
  steps: [
    "Do question one completely, including the wrong-answer message, before adding question two.",
    "Compare text with == in Python and Java, and strcmp in C. Show that 'Paris' and 'paris' are different.",
    "Keep score in one variable. Do not print a new score variable per question.",
  ],
  watch: "They print 'correct' but forget to add 1. In C, strcmp returns 0 when the strings match. That feels backwards. Say it out loud.",
  done: "A wrong answer on question one and a right answer on question two prints 1, and they can explain why.",
}, `score = 0
one = input("Capital of France? ")
if one.strip().lower() == "paris":
    score += 1
    print("Correct")
else:
    print("The answer was Paris")
two = input("2 + 2? ")
if two.strip() == "4":
    score += 1
    print("Correct")
else:
    print("The answer was 4")
print("Score:", score, "/ 2")
`, J(`Scanner in = new Scanner(System.in);
int score = 0;
System.out.print("Capital of France? ");
String one = in.nextLine().trim();
if (one.equalsIgnoreCase("Paris")) {
    score += 1;
    System.out.println("Correct");
} else {
    System.out.println("The answer was Paris");
}
System.out.print("2 + 2? ");
String two = in.nextLine().trim();
if (two.equals("4")) {
    score += 1;
    System.out.println("Correct");
} else {
    System.out.println("The answer was 4");
}
System.out.println("Score: " + score + " / 2");`), C(`char one[32], two[32];
int score = 0;
printf("Capital of France? ");
scanf("%31s", one);
if (strcmp(one, "Paris") == 0 || strcmp(one, "paris") == 0) {
    score += 1;
    printf("Correct\\n");
} else {
    printf("The answer was Paris\\n");
}
printf("2 + 2? ");
scanf("%31s", two);
if (strcmp(two, "4") == 0) {
    score += 1;
    printf("Correct\\n");
} else {
    printf("The answer was 4\\n");
}
printf("Score: %d / 2\\n", score);`, "", ["stdio.h", "string.h"]));

add(1, U1, "riddles", "Riddles", {
  say: "A riddle is a quiz with a hint. The hint is another if, not a new program.",
  goal: "Ask a riddle, give one hint if the first guess is wrong, then accept the answer.",
  steps: [
    "Pick a riddle they already know so the lesson is the branch, not the trivia.",
    "First guess wrong: print the hint and ask again. First guess right: skip the hint.",
    "Have them trace both paths with two runs.",
  ],
  watch: "They nest so deeply they cannot see which else belongs to which if. Keep it to two questions.",
  done: "They can show you the hint path and the no-hint path and name the condition for each.",
}, `print("I have cities, but no houses. What am I?")
guess = input("Guess: ").strip().lower()
if guess == "map":
    print("Yes. A map.")
else:
    print("Hint: you can fold me.")
    guess = input("Guess again: ").strip().lower()
    if guess == "map":
        print("Yes. A map.")
    else:
        print("It was a map.")
`, J(`Scanner in = new Scanner(System.in);
System.out.println("I have cities, but no houses. What am I?");
System.out.print("Guess: ");
String guess = in.nextLine().trim();
if (guess.equalsIgnoreCase("map")) {
    System.out.println("Yes. A map.");
} else {
    System.out.println("Hint: you can fold me.");
    System.out.print("Guess again: ");
    guess = in.nextLine().trim();
    if (guess.equalsIgnoreCase("map")) {
        System.out.println("Yes. A map.");
    } else {
        System.out.println("It was a map.");
    }
}`), C(`char guess[32];
printf("I have cities, but no houses. What am I?\\n");
printf("Guess: ");
scanf("%31s", guess);
if (strcmp(guess, "map") == 0 || strcmp(guess, "Map") == 0) {
    printf("Yes. A map.\\n");
} else {
    printf("Hint: you can fold me.\\n");
    printf("Guess again: ");
    scanf("%31s", guess);
    if (strcmp(guess, "map") == 0 || strcmp(guess, "Map") == 0) {
        printf("Yes. A map.\\n");
    } else {
        printf("It was a map.\\n");
    }
}`, "", ["stdio.h", "string.h"]));

add(1, U1, "calculator-2", "Calculator Part 2", {
  say: "Part 1 always added. Part 2 asks which operation, then takes one fork.",
  goal: "Read two numbers and + - * or /, and print the result. For division, refuse a zero divisor.",
  steps: [
    "Keep their Part 1 file. Add the operator question in the middle.",
    "Do addition first, then copy that branch for the others. Do not write all four from memory.",
    "Integer division is the point in Java and C: 7 / 2 is 3. Say so before they think the computer is broken.",
    "Python / makes a float. If you want the same lesson, also show 7 // 2.",
  ],
  watch: "A chain of ifs with no else, so a bad operator still falls through. And dividing by zero.",
  done: "They can explain which branch ran, and they refuse 5 / 0 with a message instead of a crash.",
}, `a = int(input("First number: "))
op = input("Operation (+ - * /): ").strip()
b = int(input("Second number: "))
if op == "+":
    print(a + b)
elif op == "-":
    print(a - b)
elif op == "*":
    print(a * b)
elif op == "/":
    if b == 0:
        print("Cannot divide by zero")
    else:
        print(a // b)
else:
    print("Unknown operation")
`, J(`Scanner in = new Scanner(System.in);
System.out.print("First number: ");
int a = Integer.parseInt(in.nextLine().trim());
System.out.print("Operation (+ - * /): ");
String op = in.nextLine().trim();
System.out.print("Second number: ");
int b = Integer.parseInt(in.nextLine().trim());
if (op.equals("+")) {
    System.out.println(a + b);
} else if (op.equals("-")) {
    System.out.println(a - b);
} else if (op.equals("*")) {
    System.out.println(a * b);
} else if (op.equals("/")) {
    if (b == 0) System.out.println("Cannot divide by zero");
    else System.out.println(a / b);
} else {
    System.out.println("Unknown operation");
}`), C(`int a, b;
char op;
printf("First number: ");
scanf("%d", &a);
printf("Operation (+ - * /): ");
scanf(" %c", &op);
printf("Second number: ");
scanf("%d", &b);
if (op == '+') printf("%d\\n", a + b);
else if (op == '-') printf("%d\\n", a - b);
else if (op == '*') printf("%d\\n", a * b);
else if (op == '/') {
    if (b == 0) printf("Cannot divide by zero\\n");
    else printf("%d\\n", a / b);
} else printf("Unknown operation\\n");`));

add(1, U1, "rock-paper-scissors", "Rock Paper Scissors", {
  say: "Two choices go in. One if decides the winner. There is no loop yet. One round only.",
  goal: "Read two throws and print who wins, or tie.",
  steps: [
    "Make a table on the board: rock beats scissors, scissors beats paper, paper beats rock.",
    "Code the tie first. Then one winning pair. Then the other two.",
    "Reject a word that is not one of the three. Do not treat it as a loss.",
  ],
  watch: "They write a condition for every pair including the ones that cannot happen. Help them delete, not add.",
  done: "They can cover the code and tell you the winner for rock vs paper, and the program agrees.",
}, `a = input("Player A: ").strip().lower()
b = input("Player B: ").strip().lower()
ok = {"rock", "paper", "scissors"}
if a not in ok or b not in ok:
    print("Choose rock, paper, or scissors")
elif a == b:
    print("Tie")
elif (a == "rock" and b == "scissors") or (a == "scissors" and b == "paper") or (a == "paper" and b == "rock"):
    print("A wins")
else:
    print("B wins")
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Player A: ");
String a = in.nextLine().trim().toLowerCase();
System.out.print("Player B: ");
String b = in.nextLine().trim().toLowerCase();
boolean okA = a.equals("rock") || a.equals("paper") || a.equals("scissors");
boolean okB = b.equals("rock") || b.equals("paper") || b.equals("scissors");
if (!okA || !okB) {
    System.out.println("Choose rock, paper, or scissors");
} else if (a.equals(b)) {
    System.out.println("Tie");
} else if ((a.equals("rock") && b.equals("scissors")) || (a.equals("scissors") && b.equals("paper")) || (a.equals("paper") && b.equals("rock"))) {
    System.out.println("A wins");
} else {
    System.out.println("B wins");
}`), C(`char a[16], b[16];
printf("Player A: ");
scanf("%15s", a);
printf("Player B: ");
scanf("%15s", b);
int okA = strcmp(a, "rock") == 0 || strcmp(a, "paper") == 0 || strcmp(a, "scissors") == 0;
int okB = strcmp(b, "rock") == 0 || strcmp(b, "paper") == 0 || strcmp(b, "scissors") == 0;
if (!okA || !okB) printf("Choose rock, paper, or scissors\\n");
else if (strcmp(a, b) == 0) printf("Tie\\n");
else if ((strcmp(a, "rock") == 0 && strcmp(b, "scissors") == 0) || (strcmp(a, "scissors") == 0 && strcmp(b, "paper") == 0) || (strcmp(a, "paper") == 0 && strcmp(b, "rock") == 0)) printf("A wins\\n");
else printf("B wins\\n");`, "", ["stdio.h", "string.h"]));

add(2, U2, "control-flow", "Control Flow", {
  say: "Control flow is the order the lines actually run. A loop sends the computer back. An if skips.",
  goal: "Trace a tiny program that uses one if and one loop, and mark which lines run for a given input.",
  steps: [
    "Have them number the lines. Then run with 1 and with 4.",
    "Ask them to write the line numbers in the order they ran, including repeats.",
    "Only then let them change the loop bound and predict the new trace.",
  ],
  watch: "They describe the code they wish ran, not the code on the screen. Make them read the condition aloud each lap.",
  done: "Their written trace matches the output for both inputs.",
}, `n = int(input("Start: "))
if n < 1:
    n = 1
    print("Raised to 1")
step = 1
while step <= n:
    print("step", step)
    step += 1
print("done")
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Start: ");
int n = Integer.parseInt(in.nextLine().trim());
if (n < 1) {
    n = 1;
    System.out.println("Raised to 1");
}
int step = 1;
while (step <= n) {
    System.out.println("step " + step);
    step += 1;
}
System.out.println("done");`), C(`int n, step = 1;
printf("Start: ");
scanf("%d", &n);
if (n < 1) {
    n = 1;
    printf("Raised to 1\\n");
}
while (step <= n) {
    printf("step %d\\n", step);
    step += 1;
}
printf("done\\n");`));

add(2, U2, "rps-loops", "Rock Paper Scissors with Loops", {
  say: "The round you already wrote stays. The loop only decides whether to play again.",
  goal: "Play rounds until the player types stop, and print the win counts.",
  steps: [
    "Paste nothing. Copy their one-round check into the loop body.",
    "Put the 'play again?' question at the bottom, not the top.",
    "Test stop on the first prompt, then a two-round game.",
  ],
  watch: "An infinite loop because the question is inside a branch that does not always run. Also resetting the score each lap.",
  done: "They can play two rounds, type stop, and the totals match what you counted.",
}, `wins = 0
rounds = 0
while True:
    throw = input("You (rock paper scissors, or stop): ").strip().lower()
    if throw == "stop":
        break
    other = input("Other player: ").strip().lower()
    rounds += 1
    if throw == other:
        print("Tie")
    elif (throw == "rock" and other == "scissors") or (throw == "scissors" and other == "paper") or (throw == "paper" and other == "rock"):
        wins += 1
        print("You win")
    else:
        print("You lose")
print(f"Wins {wins} of {rounds}")
`, J(`Scanner in = new Scanner(System.in);
int wins = 0, rounds = 0;
while (true) {
    System.out.print("You (rock paper scissors, or stop): ");
    String throw_ = in.nextLine().trim().toLowerCase();
    if (throw_.equals("stop")) break;
    System.out.print("Other player: ");
    String other = in.nextLine().trim().toLowerCase();
    rounds += 1;
    if (throw_.equals(other)) {
        System.out.println("Tie");
    } else if ((throw_.equals("rock") && other.equals("scissors")) || (throw_.equals("scissors") && other.equals("paper")) || (throw_.equals("paper") && other.equals("rock"))) {
        wins += 1;
        System.out.println("You win");
    } else {
        System.out.println("You lose");
    }
}
System.out.println("Wins " + wins + " of " + rounds);`), C(`char throw_[16], other[16];
int wins = 0, rounds = 0;
while (1) {
    printf("You (rock paper scissors, or stop): ");
    scanf("%15s", throw_);
    if (strcmp(throw_, "stop") == 0) break;
    printf("Other player: ");
    scanf("%15s", other);
    rounds += 1;
    if (strcmp(throw_, other) == 0) printf("Tie\\n");
    else if ((strcmp(throw_, "rock") == 0 && strcmp(other, "scissors") == 0) || (strcmp(throw_, "scissors") == 0 && strcmp(other, "paper") == 0) || (strcmp(throw_, "paper") == 0 && strcmp(other, "rock") == 0)) {
        wins += 1;
        printf("You win\\n");
    } else printf("You lose\\n");
}
printf("Wins %d of %d\\n", wins, rounds);`, "", ["stdio.h", "string.h"]));

add(2, U2, "calculator-3", "Calculator Part 3", {
  say: "Part 3 is Part 2 inside a loop. Quit is just another operator.",
  goal: "Keep calculating until the operator is q, and print each result.",
  steps: [
    "Move their Part 2 branches into the loop. Do not rewrite the math.",
    "Decide where q is checked: before reading the second number, so quit does not ask for a number.",
    "Run 2 + 2, then 9 / 2, then q.",
  ],
  watch: "They ask for both numbers before the operator, so q still demands a second number. Also an untested break.",
  done: "They can do three operations and quit, and a bad operator does not kill the loop.",
}, `while True:
    op = input("Operation (+ - * / or q): ").strip()
    if op == "q":
        break
    a = int(input("First: "))
    b = int(input("Second: "))
    if op == "+":
        print(a + b)
    elif op == "-":
        print(a - b)
    elif op == "*":
        print(a * b)
    elif op == "/" and b != 0:
        print(a // b)
    elif op == "/":
        print("Cannot divide by zero")
    else:
        print("Unknown operation")
print("Calculator closed")
`, J(`Scanner in = new Scanner(System.in);
while (true) {
    System.out.print("Operation (+ - * / or q): ");
    String op = in.nextLine().trim();
    if (op.equals("q")) break;
    System.out.print("First: ");
    int a = Integer.parseInt(in.nextLine().trim());
    System.out.print("Second: ");
    int b = Integer.parseInt(in.nextLine().trim());
    if (op.equals("+")) System.out.println(a + b);
    else if (op.equals("-")) System.out.println(a - b);
    else if (op.equals("*")) System.out.println(a * b);
    else if (op.equals("/") && b != 0) System.out.println(a / b);
    else if (op.equals("/")) System.out.println("Cannot divide by zero");
    else System.out.println("Unknown operation");
}
System.out.println("Calculator closed");`), C(`char op;
int a, b;
while (1) {
    printf("Operation (+ - * / or q): ");
    scanf(" %c", &op);
    if (op == 'q') break;
    printf("First: ");
    scanf("%d", &a);
    printf("Second: ");
    scanf("%d", &b);
    if (op == '+') printf("%d\\n", a + b);
    else if (op == '-') printf("%d\\n", a - b);
    else if (op == '*') printf("%d\\n", a * b);
    else if (op == '/' && b != 0) printf("%d\\n", a / b);
    else if (op == '/') printf("Cannot divide by zero\\n");
    else printf("Unknown operation\\n");
}
printf("Calculator closed\\n");`));

add(2, U2, "guessing-game", "Guessing Game", {
  say: "The secret is chosen once, before the loop. Each guess is one lap. Higher or lower is an if inside the lap.",
  goal: "Pick a secret from 1 to 20 and let them guess until they hit it, with higher/lower hints.",
  steps: [
    "Hard-code the secret first so you both know it. Random comes after the loop works.",
    "Count the guesses. Print the count at the end, not every lap.",
    "Then replace the hard-coded secret with a random number and play once yourself.",
  ],
  watch: "They generate a new secret every guess. Also an off-by-one so 20 is impossible.",
  done: "They can win, and they can explain why the secret does not change between guesses.",
}, `import random
secret = random.randint(1, 20)
guesses = 0
while True:
    guess = int(input("Guess 1-20: "))
    guesses += 1
    if guess == secret:
        print(f"Yes, in {guesses} guesses")
        break
    if guess < secret:
        print("higher")
    else:
        print("lower")
`, J(`import java.util.Random;
import java.util.Scanner;
public class Guide {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int secret = new Random().nextInt(20) + 1;
        int guesses = 0;
        while (true) {
            System.out.print("Guess 1-20: ");
            int guess = Integer.parseInt(in.nextLine().trim());
            guesses += 1;
            if (guess == secret) {
                System.out.println("Yes, in " + guesses + " guesses");
                break;
            }
            System.out.println(guess < secret ? "higher" : "lower");
        }
    }
}
`), C(`int secret, guess, guesses = 0;
srand((unsigned) time(NULL));
secret = rand() % 20 + 1;
while (1) {
    printf("Guess 1-20: ");
    scanf("%d", &guess);
    guesses += 1;
    if (guess == secret) {
        printf("Yes, in %d guesses\\n", guesses);
        break;
    }
    printf("%s\\n", guess < secret ? "higher" : "lower");
}`, "", ["stdio.h", "stdlib.h", "time.h"]));

add(2, U2, "sequences", "Sequences", {
  say: "A sequence is a rule plus a starting value. The loop applies the rule. It does not store the whole list yet.",
  goal: "Print the first n even numbers, and the first n powers of 2, from a rule.",
  steps: [
    "Write the rule in words: start at 0, add 2, stop after n prints.",
    "Have them change only the rule to get powers of 2: start at 1, multiply by 2.",
    "Ask what the 5th term is before they run n = 5.",
  ],
  watch: "They hard-code 2 4 6 8. That is not a sequence program. Also printing n+1 terms.",
  done: "They can switch from evens to powers of 2 by changing the start and the update, not the print.",
}, `n = int(input("How many: "))
value = 0
count = 0
while count < n:
    value += 2
    count += 1
    print(value)
print("---")
value = 1
count = 0
while count < n:
    print(value)
    value *= 2
    count += 1
`, J(`Scanner in = new Scanner(System.in);
System.out.print("How many: ");
int n = Integer.parseInt(in.nextLine().trim());
int value = 0, count = 0;
while (count < n) {
    value += 2;
    count += 1;
    System.out.println(value);
}
System.out.println("---");
value = 1;
count = 0;
while (count < n) {
    System.out.println(value);
    value *= 2;
    count += 1;
}`), C(`int n, value = 0, count = 0;
printf("How many: ");
scanf("%d", &n);
while (count < n) {
    value += 2;
    count += 1;
    printf("%d\\n", value);
}
printf("---\\n");
value = 1;
count = 0;
while (count < n) {
    printf("%d\\n", value);
    value *= 2;
    count += 1;
}`));

add(2, U2, "lists-1d", "1D Data Structures", {
  say: "A list keeps many values under one name. The index is the address, starting at 0.",
  goal: "Store five numbers, print them, then print the first, the last, and the sum.",
  steps: [
    "Draw five boxes. Label them 0 through 4, not 1 through 5.",
    "Fill the boxes in a loop. Then read them in a second loop. Two loops, one list.",
    "Ask for index 5 and let it fail once, then explain why.",
  ],
  watch: "Off-by-one, and using the value where they meant the index. In C, the array size is fixed. Say that before they try to grow it.",
  done: "They can change one stored number and tell you the new sum before running.",
}, `nums = []
for _ in range(5):
    nums.append(int(input("Number: ")))
print("stored", nums)
print("first", nums[0])
print("last", nums[-1])
print("sum", sum(nums))
`, J(`Scanner in = new Scanner(System.in);
int[] nums = new int[5];
int total = 0;
for (int i = 0; i < nums.length; i++) {
    System.out.print("Number: ");
    nums[i] = Integer.parseInt(in.nextLine().trim());
    total += nums[i];
}
System.out.print("stored");
for (int n : nums) System.out.print(" " + n);
System.out.println();
System.out.println("first " + nums[0]);
System.out.println("last " + nums[nums.length - 1]);
System.out.println("sum " + total);`), C(`int nums[5], total = 0, i;
for (i = 0; i < 5; i++) {
    printf("Number: ");
    scanf("%d", &nums[i]);
    total += nums[i];
}
printf("stored");
for (i = 0; i < 5; i++) printf(" %d", nums[i]);
printf("\\nfirst %d\\nlast %d\\nsum %d\\n", nums[0], nums[4], total);`));

add(2, U2, "shopping-list", "ShoppingList", {
  say: "A shopping list is a list plus a menu loop: add, show, done.",
  goal: "Add items until the user types done, then print the numbered list.",
  steps: [
    "Show the empty list first so they see the program works before any items.",
    "Add is append. Show is a loop with the index plus one, because shoppers count from 1.",
    "Done breaks. Do not use done as an item name and also as the command without deciding.",
  ],
  watch: "They print the list inside the add branch only, so the final list never shows. Also a fixed C array that overflows. Cap it and say the cap out loud.",
  done: "They can add three items, type done, and the numbers match the order they typed.",
}, `items = []
while True:
    item = input("Add item, or done: ").strip()
    if item.lower() == "done":
        break
    if item:
        items.append(item)
print("Shopping list")
for i, item in enumerate(items, start=1):
    print(f"{i}. {item}")
`, J(`Scanner in = new Scanner(System.in);
ArrayList<String> items = new ArrayList<>();
while (true) {
    System.out.print("Add item, or done: ");
    String item = in.nextLine().trim();
    if (item.equalsIgnoreCase("done")) break;
    if (!item.isEmpty()) items.add(item);
}
System.out.println("Shopping list");
for (int i = 0; i < items.size(); i++) {
    System.out.println((i + 1) + ". " + items.get(i));
}`), C(`char items[20][32];
int count = 0, i;
char item[32];
while (count < 20) {
    printf("Add item, or done: ");
    scanf("%31s", item);
    if (strcmp(item, "done") == 0) break;
    strcpy(items[count], item);
    count += 1;
}
printf("Shopping list\\n");
for (i = 0; i < count; i++) printf("%d. %s\\n", i + 1, items[i]);`, "", ["stdio.h", "string.h"]));

add(2, U2, "fibonacci", "Fibonacci Sequence", {
  say: "Each new term is the sum of the two before it. You only need to remember two numbers, not the whole history.",
  goal: "Print the first n Fibonacci numbers, starting 0, 1.",
  steps: [
    "Compute the first six on paper: 0 1 1 2 3 5. Then make the program match that, not a definition they half remember.",
    "Use two variables, previous and current. Update both at the end of the lap, in the right order.",
    "Ask what happens if they update current before they have saved the old current.",
  ],
  watch: "Starting at 1, 1 and calling it wrong, or starting at 0, 1 and losing a term. Agree on 0, 1 before coding. Also n = 1 should print only 0.",
  done: "Their first six terms match the paper list, and n = 1 does not crash or print two numbers.",
}, `n = int(input("How many: "))
prev, curr = 0, 1
for i in range(n):
    print(prev)
    prev, curr = curr, prev + curr
`, J(`Scanner in = new Scanner(System.in);
System.out.print("How many: ");
int n = Integer.parseInt(in.nextLine().trim());
int prev = 0, curr = 1;
for (int i = 0; i < n; i++) {
    System.out.println(prev);
    int next = prev + curr;
    prev = curr;
    curr = next;
}`), C(`int n, i, prev = 0, curr = 1, next;
printf("How many: ");
scanf("%d", &n);
for (i = 0; i < n; i++) {
    printf("%d\\n", prev);
    next = prev + curr;
    prev = curr;
    curr = next;
}`));

add(2, U2, "palindrome", "Palindrome", {
  say: "A palindrome reads the same forward and backward. Compare the outside letters, then move in.",
  goal: "Read one word and print yes or no. Ignore case. Do not reverse into a second string yet.",
  steps: [
    "Write 'level' on the board and draw arrows from both ends.",
    "The loop stops at the middle. They do not need to check every pair twice.",
    "Test level, noon, and train. Three words, not one.",
  ],
  watch: "Off-by-one so the middle letter is compared with itself and they think that caused a failure. Also spaces. Today's version is one word.",
  done: "They can explain which pair failed for a word that is not a palindrome.",
}, `word = input("Word: ").strip().lower()
left, right = 0, len(word) - 1
ok = True
while left < right:
    if word[left] != word[right]:
        ok = False
        break
    left += 1
    right -= 1
print("yes" if ok else "no")
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Word: ");
String word = in.nextLine().trim().toLowerCase();
int left = 0, right = word.length() - 1;
boolean ok = true;
while (left < right) {
    if (word.charAt(left) != word.charAt(right)) {
        ok = false;
        break;
    }
    left += 1;
    right -= 1;
}
System.out.println(ok ? "yes" : "no");`), C(`char word[64];
int left = 0, right, ok = 1;
printf("Word: ");
scanf("%63s", word);
right = (int) strlen(word) - 1;
while (left < right) {
    char a = word[left], b = word[right];
    if (a >= 'A' && a <= 'Z') a = (char) (a - 'A' + 'a');
    if (b >= 'A' && b <= 'Z') b = (char) (b - 'A' + 'a');
    if (a != b) { ok = 0; break; }
    left += 1;
    right -= 1;
}
printf("%s\\n", ok ? "yes" : "no");`, "", ["stdio.h", "string.h"]));

add(2, U2, "sieve", "Sieve of Eratosthenes", {
  say: "Cross out multiples. What is left is prime. You are not testing each number with a second loop of divisors.",
  goal: "Print every prime up to n using a sieve.",
  steps: [
    "Do n = 20 on paper. Cross out multiples of 2, then 3, then 5. Stop when the next starter is past the square root, and say why.",
    "The array stores crossed-out or not. 0 and 1 start crossed out.",
    "Have them compare the printed primes with the paper list before they try n = 100.",
  ],
  watch: "They mark the prime itself as crossed out when they start the inner loop at p instead of p*p or 2p. Also a loop that goes to n inclusive and walks off the array.",
  done: "Primes through 20 match the paper, and they can say why 1 is not printed.",
}, `n = int(input("Up to: "))
crossed = [False] * (n + 1)
if n >= 0:
    crossed[0] = True
if n >= 1:
    crossed[1] = True
p = 2
while p * p <= n:
    if not crossed[p]:
        m = p * p
        while m <= n:
            crossed[m] = True
            m += p
    p += 1
for i in range(n + 1):
    if not crossed[i]:
        print(i)
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Up to: ");
int n = Integer.parseInt(in.nextLine().trim());
boolean[] crossed = new boolean[n + 1];
if (n >= 0) crossed[0] = true;
if (n >= 1) crossed[1] = true;
for (int p = 2; p * p <= n; p++) {
    if (!crossed[p]) {
        for (int m = p * p; m <= n; m += p) crossed[m] = true;
    }
}
for (int i = 0; i <= n; i++) if (!crossed[i]) System.out.println(i);`), C(`int n, p, m, i;
printf("Up to: ");
scanf("%d", &n);
if (n < 0 || n > 1000) return 1;
int crossed[1001] = {0};
if (n >= 0) crossed[0] = 1;
if (n >= 1) crossed[1] = 1;
for (p = 2; p * p <= n; p++) {
    if (!crossed[p]) {
        for (m = p * p; m <= n; m += p) crossed[m] = 1;
    }
}
for (i = 0; i <= n; i++) if (!crossed[i]) printf("%d\\n", i);`));

add(2, U2, "nested-loops", "Nested Loops", {
  say: "The inner loop finishes completely before the outer loop takes one more step. That is the whole lesson.",
  goal: "Print a multiplication table for 1 through n.",
  steps: [
    "Have them say 'for each row, print every column' before they code it.",
    "Print one row on one line. The newline belongs to the outer loop.",
    "Trace row 2 by hand and circle the inner loop runs.",
  ],
  watch: "The newline is inside the inner loop, so they get a column instead of a table. Also both loops use the same variable.",
  done: "A 3 by 3 table matches what they wrote on paper, and they can say how many times the inner print ran.",
}, `n = int(input("Size: "))
for row in range(1, n + 1):
    line = []
    for col in range(1, n + 1):
        line.append(str(row * col))
    print(" ".join(line))
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Size: ");
int n = Integer.parseInt(in.nextLine().trim());
for (int row = 1; row <= n; row++) {
    for (int col = 1; col <= n; col++) {
        System.out.print(row * col);
        if (col < n) System.out.print(" ");
    }
    System.out.println();
}`), C(`int n, row, col;
printf("Size: ");
scanf("%d", &n);
for (row = 1; row <= n; row++) {
    for (col = 1; col <= n; col++) {
        printf("%d", row * col);
        if (col < n) printf(" ");
    }
    printf("\\n");
}`));

add(2, U2, "shapes", "Shapes", {
  say: "A shape on the screen is a nested loop that sometimes prints a star and sometimes prints a space.",
  goal: "Print a right triangle of stars of height n, then a hollow square.",
  steps: [
    "Triangle first: row r prints r stars. No spaces yet.",
    "Then the square: star on the border, space inside. Draw the 4 by 4 on paper and mark border cells.",
    "Have them change only n and predict the new height.",
  ],
  watch: "They special-case every row instead of writing a condition for the border. Also forgetting the newline at the end of the row.",
  done: "Both shapes match the paper for n = 4, and they can point at the condition that prints a space.",
}, `n = int(input("Size: "))
for row in range(1, n + 1):
    print("*" * row)
print()
for row in range(n):
    line = ""
    for col in range(n):
        border = row == 0 or row == n - 1 or col == 0 or col == n - 1
        line += "*" if border else " "
    print(line)
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Size: ");
int n = Integer.parseInt(in.nextLine().trim());
for (int row = 1; row <= n; row++) {
    for (int star = 0; star < row; star++) System.out.print("*");
    System.out.println();
}
System.out.println();
for (int row = 0; row < n; row++) {
    for (int col = 0; col < n; col++) {
        boolean border = row == 0 || row == n - 1 || col == 0 || col == n - 1;
        System.out.print(border ? "*" : " ");
    }
    System.out.println();
}`), C(`int n, row, col, star;
printf("Size: ");
scanf("%d", &n);
for (row = 1; row <= n; row++) {
    for (star = 0; star < row; star++) printf("*");
    printf("\\n");
}
printf("\\n");
for (row = 0; row < n; row++) {
    for (col = 0; col < n; col++) {
        int border = row == 0 || row == n - 1 || col == 0 || col == n - 1;
        printf("%c", border ? '*' : ' ');
    }
    printf("\\n");
}`));

add(2, U2, "loop-game", "Loop Game", {
  say: "A small game is a loop that reads a move, updates state, and prints the new state. Stop when the player wins or quits.",
  goal: "A number-climb game: start at 0, add the typed number, win at 10 or more, quit on 0.",
  steps: [
    "Name the three parts of the lap: read, update, check. Have them point at each in the code.",
    "Print the total every lap so they can see the state.",
    "Then let them change the win line from 10 to 20 without rewriting the loop.",
  ],
  watch: "The win check is above the update, so they can never win on the current move. Also quitting only works if they remember to break.",
  done: "They can win, quit early, and tell you which line changed the total.",
}, `total = 0
while total < 10:
    print("Total:", total)
    step = int(input("Add (0 quits): "))
    if step == 0:
        print("Quit")
        break
    total += step
else:
    print("You reached", total)
`, J(`Scanner in = new Scanner(System.in);
int total = 0;
boolean quit = false;
while (total < 10) {
    System.out.println("Total: " + total);
    System.out.print("Add (0 quits): ");
    int step = Integer.parseInt(in.nextLine().trim());
    if (step == 0) {
        quit = true;
        System.out.println("Quit");
        break;
    }
    total += step;
}
if (!quit) System.out.println("You reached " + total);`), C(`int total = 0, step, quit = 0;
while (total < 10) {
    printf("Total: %d\\n", total);
    printf("Add (0 quits): ");
    scanf("%d", &step);
    if (step == 0) {
        quit = 1;
        printf("Quit\\n");
        break;
    }
    total += step;
}
if (!quit) printf("You reached %d\\n", total);`));

add(3, U3, "arrays-2d", "2D Arrays", {
  say: "A 2D array is a list of lists. The first index is the row. The second is the column. Both start at 0.",
  goal: "Fill a 3 by 3 grid with the numbers 1 through 9, print it, and print the center cell.",
  steps: [
    "Draw the grid and write row, column under two example cells before anyone types.",
    "Fill it with one nested loop. Do not write nine separate assignments.",
    "Ask for grid[1][1] out loud. It is 5, not 1.",
  ],
  watch: "Swapping row and column, and in C forgetting that int grid[3][3] is rows then columns.",
  done: "They can change one cell and tell you the new printed grid before running.",
}, `grid = []
n = 1
for row in range(3):
    grid.append([])
    for _col in range(3):
        grid[row].append(n)
        n += 1
for row in grid:
    print(row)
print("center", grid[1][1])
`, J(`int[][] grid = new int[3][3];
int n = 1;
for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 3; col++) {
        grid[row][col] = n;
        n += 1;
    }
}
for (int[] row : grid) {
    for (int value : row) System.out.print(value + " ");
    System.out.println();
}
System.out.println("center " + grid[1][1]);`), C(`int grid[3][3], n = 1, row, col;
for (row = 0; row < 3; row++) {
    for (col = 0; col < 3; col++) {
        grid[row][col] = n;
        n += 1;
    }
}
for (row = 0; row < 3; row++) {
    for (col = 0; col < 3; col++) printf("%d ", grid[row][col]);
    printf("\\n");
}
printf("center %d\\n", grid[1][1]);`));

add(3, U3, "cabinet", "Cabinet", {
  say: "A cabinet is a 2D array with a meaning: row is the shelf, column is the slot. The data is whatever you store there.",
  goal: "Store item names on a 2 by 3 cabinet and print the shelf a requested item is on.",
  steps: [
    "Name the shelves out loud: shelf 0 and shelf 1. Do not start at shelf 1 in the code.",
    "Search with a nested loop. When you find the name, remember the shelf and stop.",
    "Search for an item that is not there and print not found. That path is part of the project.",
  ],
  watch: "They return on the first empty slot. Empty is not the same as not found until the whole cabinet is checked.",
  done: "They can move an item to another shelf in the data and the search reports the new shelf.",
}, `cabinet = [["pens", "tape", "cups"], ["paper", "ink", "clips"]]
want = input("Find: ").strip().lower()
found = -1
for shelf, items in enumerate(cabinet):
    if want in items:
        found = shelf
        break
print("not found" if found < 0 else f"shelf {found}")
`, J(`String[][] cabinet = {{"pens", "tape", "cups"}, {"paper", "ink", "clips"}};
Scanner in = new Scanner(System.in);
System.out.print("Find: ");
String want = in.nextLine().trim().toLowerCase();
int found = -1;
for (int shelf = 0; shelf < cabinet.length && found < 0; shelf++) {
    for (String item : cabinet[shelf]) {
        if (item.equals(want)) found = shelf;
    }
}
System.out.println(found < 0 ? "not found" : "shelf " + found);`), C(`const char *cabinet[2][3] = {{"pens", "tape", "cups"}, {"paper", "ink", "clips"}};
char want[32];
int shelf, slot, found = -1;
printf("Find: ");
scanf("%31s", want);
for (shelf = 0; shelf < 2 && found < 0; shelf++) {
    for (slot = 0; slot < 3; slot++) {
        if (strcmp(cabinet[shelf][slot], want) == 0) found = shelf;
    }
}
if (found < 0) printf("not found\\n");
else printf("shelf %d\\n", found);`, "", ["stdio.h", "string.h"]));

add(3, U3, "shipping", "Shipping", {
  say: "Shipping is a table: each row is a package, each column is a field. You scan the table and apply a rule.",
  goal: "Given weight and zone for three packages, print the shipping cost and the total.",
  steps: [
    "Write the price rule on the board first: zone 1 is 5 plus 2 per pound, zone 2 is 8 plus 3 per pound.",
    "Store the packages in a 2D array or a list of pairs. Do not use six separate variables.",
    "Print one line per package, then the total. The total is an accumulator, not a second table.",
  ],
  watch: "They hard-code the three prices. Change one weight and ask them to recompute. If they edit the print, the table is not doing the work.",
  done: "Changing one weight changes one line and the total, and they can show you the line that computed the cost.",
}, `packages = [[2, 1], [5, 2], [1, 1]]
total = 0
for weight, zone in packages:
    rate = 2 if zone == 1 else 3
    base = 5 if zone == 1 else 8
    cost = base + rate * weight
    total += cost
    print(f"{weight} lb zone {zone}: {cost}")
print("total", total)
`, J(`int[][] packages = {{2, 1}, {5, 2}, {1, 1}};
int total = 0;
for (int[] pack : packages) {
    int weight = pack[0], zone = pack[1];
    int rate = zone == 1 ? 2 : 3;
    int base = zone == 1 ? 5 : 8;
    int cost = base + rate * weight;
    total += cost;
    System.out.println(weight + " lb zone " + zone + ": " + cost);
}
System.out.println("total " + total);`), C(`int packages[3][2] = {{2, 1}, {5, 2}, {1, 1}};
int i, total = 0;
for (i = 0; i < 3; i++) {
    int weight = packages[i][0], zone = packages[i][1];
    int rate = zone == 1 ? 2 : 3;
    int base = zone == 1 ? 5 : 8;
    int cost = base + rate * weight;
    total += cost;
    printf("%d lb zone %d: %d\\n", weight, zone, cost);
}
printf("total %d\\n", total);`));

add(3, U3, "large-projects", "Large Projects", {
  say: "A large project is the same skills in a named order. Plan the data, then the steps, then the code. Do not start by typing.",
  goal: "Build a tiny grade book: store three names and scores, print the average, and print who is below it.",
  steps: [
    "Spend five minutes on paper: what is stored, what is computed, what is printed.",
    "Write the storage and the print of raw data first. Average second. The below-average list last.",
    "If they get lost, point at the paper step, not at a new idea.",
  ],
  watch: "They start with the average before the data exists. Also integer division: decide whether the average may be a decimal.",
  done: "They can add a fourth student by changing the data, and the average and the below list both update.",
}, `students = [("Ada", 90), ("Lin", 70), ("Max", 80)]
average = sum(score for _name, score in students) / len(students)
print("average", average)
for name, score in students:
    if score < average:
        print(name, "is below average")
`, J(`String[] names = {"Ada", "Lin", "Max"};
int[] scores = {90, 70, 80};
int total = 0;
for (int score : scores) total += score;
double average = total / (double) scores.length;
System.out.println("average " + average);
for (int i = 0; i < names.length; i++) {
    if (scores[i] < average) System.out.println(names[i] + " is below average");
}`), C(`const char *names[] = {"Ada", "Lin", "Max"};
int scores[] = {90, 70, 80};
int i, total = 0, n = 3;
for (i = 0; i < n; i++) total += scores[i];
double average = total / (double) n;
printf("average %.1f\\n", average);
for (i = 0; i < n; i++) {
    if (scores[i] < average) printf("%s is below average\\n", names[i]);
}`, "", ["stdio.h"]));

add(3, U3, "tic-tac-toe", "Tic-Tac-Toe", {
  say: "The board is a 3 by 3 array. A turn is: print, read a cell, reject a bad cell, place the mark, check the win.",
  goal: "Two players play 3 by 3 tic-tac-toe in the terminal until win, draw, or the board is full.",
  steps: [
    "Print the board with cell numbers 1 through 9 before you accept moves. Players should not have to know indexes.",
    "Write the legal-move check before the win check. An illegal move must not change the player.",
    "Win check last: three rows, three columns, two diagonals. Test a second-row win on purpose.",
  ],
  watch: "The player switches even when the move was rejected. Also a win check that only looks at rows.",
  done: "They can play a full game, a rejected move does not skip a turn, and a column win is detected.",
}, `board = [" "] * 9
player = "X"
while True:
    for i in range(0, 9, 3):
        print(" | ".join(board[i:i + 3]))
    if " " not in board:
        print("Draw")
        break
    move = int(input(player + " cell 1-9: ")) - 1
    if move < 0 or move > 8 or board[move] != " ":
        print("No")
        continue
    board[move] = player
    lines = [board[0:3], board[3:6], board[6:9], board[0::3], board[1::3], board[2::3], board[0::4], board[2:7:2]]
    if any(line.count(player) == 3 for line in lines):
        print(player, "wins")
        break
    player = "O" if player == "X" else "X"
`, J(`Scanner in = new Scanner(System.in);
char[] board = new char[9];
java.util.Arrays.fill(board, ' ');
char player = 'X';
while (true) {
    for (int i = 0; i < 9; i++) {
        System.out.print(board[i]);
        System.out.print(i % 3 == 2 ? "\\n" : " | ");
    }
    boolean open = false;
    for (char cell : board) if (cell == ' ') open = true;
    if (!open) { System.out.println("Draw"); break; }
    System.out.print(player + " cell 1-9: ");
    int move = Integer.parseInt(in.nextLine().trim()) - 1;
    if (move < 0 || move > 8 || board[move] != ' ') { System.out.println("No"); continue; }
    board[move] = player;
    int[][] lines = {{0,1,2},{3,4,5},{6,7,8},{0,3,6},{1,4,7},{2,5,8},{0,4,8},{2,4,6}};
    boolean win = false;
    for (int[] line : lines) win = win || (board[line[0]] == player && board[line[1]] == player && board[line[2]] == player);
    if (win) { System.out.println(player + " wins"); break; }
    player = player == 'X' ? 'O' : 'X';
}`), C(`char board[9], player = 'X';
int i, move, open, win;
int lines[8][3] = {{0,1,2},{3,4,5},{6,7,8},{0,3,6},{1,4,7},{2,5,8},{0,4,8},{2,4,6}};
for (i = 0; i < 9; i++) board[i] = ' ';
while (1) {
    for (i = 0; i < 9; i++) printf("%c%s", board[i], i % 3 == 2 ? "\\n" : " | ");
    open = 0;
    for (i = 0; i < 9; i++) if (board[i] == ' ') open = 1;
    if (!open) { printf("Draw\\n"); break; }
    printf("%c cell 1-9: ", player);
    scanf("%d", &move);
    move -= 1;
    if (move < 0 || move > 8 || board[move] != ' ') { printf("No\\n"); continue; }
    board[move] = player;
    win = 0;
    for (i = 0; i < 8; i++) if (board[lines[i][0]] == player && board[lines[i][1]] == player && board[lines[i][2]] == player) win = 1;
    if (win) { printf("%c wins\\n", player); break; }
    player = player == 'X' ? 'O' : 'X';
}`));

add(4, U4, "functions-intro", "Functions Introduction", {
  say: "A function is a named recipe. You call it. The lines inside do not run until the call.",
  goal: "Write a function that prints a greeting, call it twice, and point at the call sites.",
  steps: [
    "Write the function first and run the program before any call. Nothing should print. That surprise is the lesson.",
    "Add one call. Then a second call with a different name.",
    "Ask which line runs first: the def, or the call. The def is stored. The call runs it.",
  ],
  watch: "They put the call inside the function and recurse by accident. Also, in C, the function must be declared above main or given a prototype.",
  done: "They can add a third call without copying the print line.",
}, `def greet(name):
    print("Hello,", name)

greet("Ada")
greet("Lin")
`, J(`greet("Ada");
greet("Lin");`, `static void greet(String name) {
    System.out.println("Hello, " + name);
}`), C(`greet("Ada");
greet("Lin");`, `void greet(const char *name) {
    printf("Hello, %s\\n", name);
}`, ["stdio.h"]));

add(4, U4, "parameters", "Parameters", {
  say: "A parameter is a slot the caller fills. The name inside the function does not have to match the name outside.",
  goal: "Write a function that takes two numbers and prints the larger one. Call it with variables and with raw numbers.",
  steps: [
    "Call larger(3, 9) before you introduce variables. Then call it with two variables.",
    "Change the variable names outside the function and show that the function still works.",
    "Ask what happens if they swap the arguments. Have them predict, then run.",
  ],
  watch: "They use the outside variable names inside the function. Rename the outside ones so that cheat breaks.",
  done: "They can explain that the parameter gets a copy of the value, and prove it by changing the outside variable after the call.",
}, `def larger(a, b):
    print(a if a > b else b)

x = int(input("First: "))
y = int(input("Second: "))
larger(x, y)
larger(3, 9)
`, J(`Scanner in = new Scanner(System.in);
System.out.print("First: ");
int x = Integer.parseInt(in.nextLine().trim());
System.out.print("Second: ");
int y = Integer.parseInt(in.nextLine().trim());
larger(x, y);
larger(3, 9);`, `static void larger(int a, int b) {
    System.out.println(a > b ? a : b);
}`), C(`int x, y;
printf("First: ");
scanf("%d", &x);
printf("Second: ");
scanf("%d", &y);
larger(x, y);
larger(3, 9);`, `void larger(int a, int b) {
    printf("%d\\n", a > b ? a : b);
}`));

add(4, U4, "area-volume", "AreaVolume", {
  say: "Area and volume are functions that return a number. Print is not the same as return.",
  goal: "Return the area of a rectangle and the volume of a box. Print the returned values from main.",
  steps: [
    "Write area first. Have them print the call, not print inside the function.",
    "Then volume can call area and multiply by depth, or multiply three numbers. Either is fine if they can explain it.",
    "Ask what the function gives back if they forget return. Show the empty result once.",
  ],
  watch: "Printing inside the function and also returning, so the number appears twice. Also integer division if they divide anywhere. This lesson is multiplication.",
  done: "They can use the returned area in a later line without recomputing it.",
}, `def area(w, h):
    return w * h

def volume(w, h, d):
    return area(w, h) * d

w = int(input("Width: "))
h = int(input("Height: "))
d = int(input("Depth: "))
print("area", area(w, h))
print("volume", volume(w, h, d))
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Width: ");
int w = Integer.parseInt(in.nextLine().trim());
System.out.print("Height: ");
int h = Integer.parseInt(in.nextLine().trim());
System.out.print("Depth: ");
int d = Integer.parseInt(in.nextLine().trim());
System.out.println("area " + area(w, h));
System.out.println("volume " + volume(w, h, d));`, `static int area(int w, int h) { return w * h; }
static int volume(int w, int h, int d) { return area(w, h) * d; }`), C(`int w, h, d;
printf("Width: ");
scanf("%d", &w);
printf("Height: ");
scanf("%d", &h);
printf("Depth: ");
scanf("%d", &d);
printf("area %d\\n", area(w, h));
printf("volume %d\\n", volume(w, h, d));`, `int area(int w, int h) { return w * h; }
int volume(int w, int h, int d) { return area(w, h) * d; }`));

add(4, U4, "celsius", "Celsius to Fahrenheit", {
  say: "The formula is a function. Input and print stay outside it so the formula can be tested by itself.",
  goal: "Convert Celsius to Fahrenheit with F = C * 9 / 5 + 32, using a function that returns the result.",
  steps: [
    "Check 0 C, 100 C, and -40 C on paper first. -40 is the same in both scales. That is a good test.",
    "In Java and C, do the multiplication before the division, or use a double. 9 / 5 in integers is 1.",
    "Have them call the function three times. Do not rewrite the formula three times.",
  ],
  watch: "Integer division. Also printing inside the converter so they cannot use the result.",
  done: "0 becomes 32, 100 becomes 212, and they can point at the return.",
}, `def to_f(c):
    return c * 9 / 5 + 32

for c in (0, 100, -40):
    print(c, "C =", to_f(c), "F")
`, J(`System.out.println("0 C = " + toF(0) + " F");
System.out.println("100 C = " + toF(100) + " F");
System.out.println("-40 C = " + toF(-40) + " F");`, `static double toF(double c) {
    return c * 9 / 5 + 32;
}`), C(`printf("0 C = %.1f F\\n", to_f(0));
printf("100 C = %.1f F\\n", to_f(100));
printf("-40 C = %.1f F\\n", to_f(-40));`, `double to_f(double c) {
    return c * 9.0 / 5.0 + 32;
}`, ["stdio.h"]));

add(4, U4, "how-many-digits", "How Many Digits", {
  say: "Counting digits is a loop you hide inside a function. The caller should not care how you counted.",
  goal: "Write digits(n) that returns how many digits are in a non-negative integer. 0 has one digit.",
  steps: [
    "Agree on the examples first: 0 -> 1, 7 -> 1, 10 -> 2, 100 -> 3.",
    "The loop divides by 10 and counts. Stop when the number becomes 0, but handle 0 before the loop.",
    "Call it on those four examples. Do not trust one call.",
  ],
  watch: "Returning 0 for 0, and an infinite loop if they forget to divide.",
  done: "All four examples match, and the counting loop is not in main.",
}, `def digits(n):
    if n == 0:
        return 1
    count = 0
    while n > 0:
        n //= 10
        count += 1
    return count

for n in (0, 7, 10, 100):
    print(n, digits(n))
`, J(`System.out.println("0 " + digits(0));
System.out.println("7 " + digits(7));
System.out.println("10 " + digits(10));
System.out.println("100 " + digits(100));`, `static int digits(int n) {
    if (n == 0) return 1;
    int count = 0;
    while (n > 0) {
        n /= 10;
        count += 1;
    }
    return count;
}`), C(`printf("0 %d\\n", digits(0));
printf("7 %d\\n", digits(7));
printf("10 %d\\n", digits(10));
printf("100 %d\\n", digits(100));`, `int digits(int n) {
    int count = 0;
    if (n == 0) return 1;
    while (n > 0) {
        n /= 10;
        count += 1;
    }
    return count;
}`));

add(4, U4, "ciphers", "Ciphers", {
  say: "A Caesar cipher shifts each letter by a key and wraps from z back to a. Other characters stay put.",
  goal: "Write encode(text, key) and use it to encode and decode. Decode is encode with the opposite shift.",
  steps: [
    "Shift one letter on paper, including z + 1 = a, before writing the loop.",
    "Keep the function on letters only. Spaces and punctuation pass through.",
    "Decode by calling the same function with a negative key, or with 26 - key. Do not write a second formula.",
  ],
  watch: "They shift the ASCII value and never wrap, so z becomes a punctuation mark. Also shifting spaces.",
  done: "encode then decode returns the original word, including a word that contains z.",
}, `def encode(text, key):
    out = []
    for ch in text:
        if "a" <= ch <= "z":
            out.append(chr((ord(ch) - ord("a") + key) % 26 + ord("a")))
        elif "A" <= ch <= "Z":
            out.append(chr((ord(ch) - ord("A") + key) % 26 + ord("A")))
        else:
            out.append(ch)
    return "".join(out)

word = input("Word: ")
secret = encode(word, 3)
print(secret)
print(encode(secret, -3))
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Word: ");
String word = in.nextLine();
String secret = encode(word, 3);
System.out.println(secret);
System.out.println(encode(secret, -3));`, `static String encode(String text, int key) {
    StringBuilder out = new StringBuilder();
    for (int i = 0; i < text.length(); i++) {
        char ch = text.charAt(i);
        if (ch >= 'a' && ch <= 'z') out.append((char) ((ch - 'a' + key % 26 + 26) % 26 + 'a'));
        else if (ch >= 'A' && ch <= 'Z') out.append((char) ((ch - 'A' + key % 26 + 26) % 26 + 'A'));
        else out.append(ch);
    }
    return out.toString();
}`), C(`char word[80], secret[80];
printf("Word: ");
scanf("%79s", word);
encode(word, 3, secret);
printf("%s\\n", secret);
encode(secret, -3, word);
printf("%s\\n", word);`, `void encode(const char *text, int key, char *out) {
    int i;
    key %= 26;
    if (key < 0) key += 26;
    for (i = 0; text[i]; i++) {
        char ch = text[i];
        if (ch >= 'a' && ch <= 'z') out[i] = (char) ((ch - 'a' + key) % 26 + 'a');
        else if (ch >= 'A' && ch <= 'Z') out[i] = (char) ((ch - 'A' + key) % 26 + 'A');
        else out[i] = ch;
    }
    out[i] = '\\0';
}`, ["stdio.h"]));

add(4, U4, "upgrade-games", "Upgrading Tic-Tac-Toe and Connect-Four", {
  say: "An upgrade is not a rewrite. Pull the win check into a function, then reuse the idea for four in a row.",
  goal: "Write winner(board) for tic-tac-toe, then a four-in-a-row check on one row of a Connect Four board.",
  steps: [
    "Start from their tic-tac-toe. Move the win lines into a function that returns the winner or a space.",
    "Main should only ask the function. If main still contains the eight lines, it is not upgraded.",
    "Then give them one Connect Four row, like XXXXOOX, and a function that reports X, O, or none.",
  ],
  watch: "They copy the tic-tac-toe function and change 3 to 4 without walking a window. Four in a row can start at column 0, 1, 2, or 3 on a 7-wide row.",
  done: "Tic-tac-toe still works through the function, and the Connect Four check finds XXXX that does not start at the left edge.",
}, `def ttt_winner(board):
    lines = [board[0:3], board[3:6], board[6:9], board[0::3], board[1::3], board[2::3], board[0::4], board[2:7:2]]
    for line in lines:
        if line[0] != " " and line.count(line[0]) == 3:
            return line[0]
    return " "

def connect_four(row):
    for i in range(len(row) - 3):
        chunk = row[i:i + 4]
        if chunk[0] != " " and chunk.count(chunk[0]) == 4:
            return chunk[0]
    return " "

print(ttt_winner(["X", "X", "X", "O", "O", " ", "O", " ", " "]))
print("row", connect_four("OOXXXXO"))
`, J(`char[] sample = {'X','X','X','O','O',' ','O',' ',' '};
System.out.println(tttWinner(sample));
System.out.println(connectFour("OOXXXXO"));`, `static char tttWinner(char[] board) {
    int[][] lines = {{0,1,2},{3,4,5},{6,7,8},{0,3,6},{1,4,7},{2,5,8},{0,4,8},{2,4,6}};
    for (int[] line : lines) {
        if (board[line[0]] != ' ' && board[line[0]] == board[line[1]] && board[line[1]] == board[line[2]]) return board[line[0]];
    }
    return ' ';
}
static char connectFour(String row) {
    for (int i = 0; i + 3 < row.length(); i++) {
        char ch = row.charAt(i);
        if (ch != ' ' && ch == row.charAt(i + 1) && ch == row.charAt(i + 2) && ch == row.charAt(i + 3)) return ch;
    }
    return ' ';
}`), C(`char sample[] = {'X','X','X','O','O',' ','O',' ',' '};
printf("%c\\n", ttt_winner(sample));
printf("%c\\n", connect_four("OOXXXXO"));`, `char ttt_winner(char *board) {
    int lines[8][3] = {{0,1,2},{3,4,5},{6,7,8},{0,3,6},{1,4,7},{2,5,8},{0,4,8},{2,4,6}};
    int i;
    for (i = 0; i < 8; i++) {
        char ch = board[lines[i][0]];
        if (ch != ' ' && ch == board[lines[i][1]] && ch == board[lines[i][2]]) return ch;
    }
    return ' ';
}
char connect_four(const char *row) {
    int i, n = (int) strlen(row);
    for (i = 0; i + 3 < n; i++) {
        if (row[i] != ' ' && row[i] == row[i + 1] && row[i] == row[i + 2] && row[i] == row[i + 3]) return row[i];
    }
    return ' ';
}`, ["stdio.h", "string.h"]));

add(4, U4, "game-of-life", "Conway's Game of Life", {
  say: "Life is two grids. You read the current one and write the next one. Never update a cell you still need to count.",
  goal: "Run a few generations of Life on a small grid and print each one.",
  steps: [
    "State the rules before code: fewer than 2 neighbors dies, 2 or 3 live stays, 3 empty becomes live, 4 or more dies.",
    "neighbors() is its own function. next_board() is its own function. Print is its own function.",
    "Use a blinker, three vertical live cells, and show it flip to horizontal.",
  ],
  watch: "They edit the same grid they are counting. The blinker will look random. Make them keep two grids.",
  done: "The blinker oscillates, and they can point at the function that counts neighbors.",
}, `def neighbors(grid, r, c):
    count = 0
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            rr, cc = r + dr, c + dc
            if 0 <= rr < len(grid) and 0 <= cc < len(grid[0]) and grid[rr][cc] == 1:
                count += 1
    return count

def next_grid(grid):
    nxt = [[0] * len(grid[0]) for _ in grid]
    for r in range(len(grid)):
        for c in range(len(grid[0])):
            n = neighbors(grid, r, c)
            if grid[r][c] == 1:
                nxt[r][c] = 1 if n in (2, 3) else 0
            else:
                nxt[r][c] = 1 if n == 3 else 0
    return nxt

grid = [[0,0,0,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,0,0,0]]
for _gen in range(3):
    for row in grid:
        print("".join("#" if cell else "." for cell in row))
    print()
    grid = next_grid(grid)
`, J(`int[][] grid = {{0,0,0,0,0},{0,0,1,0,0},{0,0,1,0,0},{0,0,1,0,0},{0,0,0,0,0}};
for (int gen = 0; gen < 3; gen++) {
    printGrid(grid);
    grid = nextGrid(grid);
}`, `static void printGrid(int[][] grid) {
    for (int[] row : grid) {
        for (int cell : row) System.out.print(cell == 1 ? "#" : ".");
        System.out.println();
    }
    System.out.println();
}
static int neighbors(int[][] grid, int r, int c) {
    int count = 0;
    for (int dr = -1; dr <= 1; dr++) for (int dc = -1; dc <= 1; dc++) {
        if (dr == 0 && dc == 0) continue;
        int rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < grid.length && cc < grid[0].length && grid[rr][cc] == 1) count++;
    }
    return count;
}
static int[][] nextGrid(int[][] grid) {
    int[][] nxt = new int[grid.length][grid[0].length];
    for (int r = 0; r < grid.length; r++) for (int c = 0; c < grid[0].length; c++) {
        int n = neighbors(grid, r, c);
        nxt[r][c] = grid[r][c] == 1 ? (n == 2 || n == 3 ? 1 : 0) : (n == 3 ? 1 : 0);
    }
    return nxt;
}`), C(`int grid[5][5] = {{0,0,0,0,0},{0,0,1,0,0},{0,0,1,0,0},{0,0,1,0,0},{0,0,0,0,0}};
int gen;
for (gen = 0; gen < 3; gen++) {
    print_grid(grid);
    next_grid(grid);
}`, `void print_grid(int grid[5][5]) {
    int r, c;
    for (r = 0; r < 5; r++) {
        for (c = 0; c < 5; c++) printf("%c", grid[r][c] ? '#' : '.');
        printf("\\n");
    }
    printf("\\n");
}
int neighbors(int grid[5][5], int r, int c) {
    int dr, dc, count = 0;
    for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) {
        int rr = r + dr, cc = c + dc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < 5 && cc < 5 && grid[rr][cc]) count++;
    }
    return count;
}
void next_grid(int grid[5][5]) {
    int nxt[5][5], r, c;
    for (r = 0; r < 5; r++) for (c = 0; c < 5; c++) {
        int n = neighbors(grid, r, c);
        nxt[r][c] = grid[r][c] ? (n == 2 || n == 3) : (n == 3);
    }
    for (r = 0; r < 5; r++) for (c = 0; c < 5; c++) grid[r][c] = nxt[r][c];
}`, ["stdio.h"]));

add(5, U5, "recursion-intro", "Basic Recursion Projects", {
  say: "A recursive function does one small piece, then calls itself on a smaller piece, and must have a stop.",
  goal: "Write a function that prints its depth and calls itself until the depth hits a limit.",
  steps: [
    "Draw the calls as a stack of plates. Each call is a new plate. The stop takes a plate off.",
    "Have them run depth 3 and point at which print happened on the way down.",
    "Remove the stop and let it fail once, if the language will stop it. Then put the stop back and name it the base case.",
  ],
  watch: "The recursive call is not smaller, so it never hits the base case. Also a base case that is written but never reached because it is below the call.",
  done: "They can point at the base case and at the line that makes the problem smaller.",
}, `def dive(depth, limit):
    if depth == limit:
        print("stop at", depth)
        return
    print("down", depth)
    dive(depth + 1, limit)
    print("back", depth)

dive(0, 3)
`, J(`dive(0, 3);`, `static void dive(int depth, int limit) {
    if (depth == limit) {
        System.out.println("stop at " + depth);
        return;
    }
    System.out.println("down " + depth);
    dive(depth + 1, limit);
    System.out.println("back " + depth);
}`), C(`dive(0, 3);`, `void dive(int depth, int limit) {
    if (depth == limit) {
        printf("stop at %d\\n", depth);
        return;
    }
    printf("down %d\\n", depth);
    dive(depth + 1, limit);
    printf("back %d\\n", depth);
}`));

add(5, U5, "countdown", "CountDown CountUp", {
  say: "Some prints happen before the recursive call. Some happen after. That is how one function counts down and then back up.",
  goal: "Print n down to 1, then 1 back up to n, with one function.",
  steps: [
    "Put a print before the call and run n = 3. They should see only the way down if the second print is missing.",
    "Add the print after the call. Do not write a second function.",
    "Ask which number prints last. It is n, on the way back.",
  ],
  watch: "They subtract after the call, so the argument never changes. Also two loops instead of recursion. This unit is recursion.",
  done: "For 3, the output is down 3, 2, 1, then up 1, 2, 3, and they can say why the ups are reversed.",
}, `def count(n):
    if n == 0:
        return
    print("down", n)
    count(n - 1)
    print("up", n)

count(int(input("Start: ")))
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Start: ");
count(Integer.parseInt(in.nextLine().trim()));`, `static void count(int n) {
    if (n == 0) return;
    System.out.println("down " + n);
    count(n - 1);
    System.out.println("up " + n);
}`), C(`int n;
printf("Start: ");
scanf("%d", &n);
count(n);`, `void count(int n) {
    if (n == 0) return;
    printf("down %d\\n", n);
    count(n - 1);
    printf("up %d\\n", n);
}`));

add(5, U5, "factorial", "Recursive Factorial", {
  say: "Factorial of n is n times factorial of n - 1. Factorial of 0 is 1. That second sentence is the base case.",
  goal: "Return n! with recursion and test 0, 1, and 5.",
  steps: [
    "Compute 4! on paper as 4 * 3 * 2 * 1. Then match that shape in the return line.",
    "Test 0 before you test 5. People forget the base case until 0 crashes or returns 0.",
    "Ask them not to use a loop. If there is a loop, it is not this module.",
  ],
  watch: "Base case n == 1 only, so factorial(0) recurses forever. Also multiplying after a print and forgetting to return the product.",
  done: "0! is 1, 5! is 120, and the function has no loop.",
}, `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

for n in (0, 1, 5):
    print(n, factorial(n))
`, J(`System.out.println("0 " + factorial(0));
System.out.println("1 " + factorial(1));
System.out.println("5 " + factorial(5));`, `static int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}`), C(`printf("0 %d\\n", factorial(0));
printf("1 %d\\n", factorial(1));
printf("5 %d\\n", factorial(5));`, `int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}`));

add(5, U5, "recursive-addition", "Recursive Addition", {
  say: "Adding b is adding 1, b times. You may not use + between a and b. You may use + 1.",
  goal: "Write add(a, b) recursively for non-negative b.",
  steps: [
    "Say the base case first: add(a, 0) is a.",
    "The recursive case is 1 + add(a, b - 1).",
    "Trace add(3, 2) on the board as two calls, not as a loop.",
  ],
  watch: "They write a + b and call it recursive because the function calls itself once with the answer. The arguments must get smaller.",
  done: "add(3, 2) is 5, add(3, 0) is 3, and the body does not contain a + b.",
}, `def add(a, b):
    if b == 0:
        return a
    return 1 + add(a, b - 1)

print(add(3, 2))
print(add(3, 0))
`, J(`System.out.println(add(3, 2));
System.out.println(add(3, 0));`, `static int add(int a, int b) {
    if (b == 0) return a;
    return 1 + add(a, b - 1);
}`), C(`printf("%d\\n", add(3, 2));
printf("%d\\n", add(3, 0));`, `int add(int a, int b) {
    if (b == 0) return a;
    return 1 + add(a, b - 1);
}`));

add(5, U5, "recursive-multiply", "Recursive Multiply", {
  say: "Multiplication is repeated addition. Use the add function you already trust, or add a to a smaller product.",
  goal: "Write multiply(a, b) recursively without using * .",
  steps: [
    "Base case: multiply(a, 0) is 0. Not a. That is the difference from addition.",
    "Recursive case: a + multiply(a, b - 1).",
    "Trace 4 * 3 as 4 + 4 + 4 + 0.",
  ],
  watch: "Base case returns a, so every product is too big. Also using * and wrapping it in a function.",
  done: "4 * 3 is 12, 4 * 0 is 0, and there is no * in the function.",
}, `def multiply(a, b):
    if b == 0:
        return 0
    return a + multiply(a, b - 1)

print(multiply(4, 3))
print(multiply(4, 0))
`, J(`System.out.println(multiply(4, 3));
System.out.println(multiply(4, 0));`, `static int multiply(int a, int b) {
    if (b == 0) return 0;
    return a + multiply(a, b - 1);
}`), C(`printf("%d\\n", multiply(4, 3));
printf("%d\\n", multiply(4, 0));`, `int multiply(int a, int b) {
    if (b == 0) return 0;
    return a + multiply(a, b - 1);
}`));

add(5, U5, "recursive-exponent", "Recursive Exponent", {
  say: "Exponent is repeated multiplication. power(a, b) is a times power(a, b - 1). power(a, 0) is 1.",
  goal: "Compute a to the b recursively and test a zero exponent.",
  steps: [
    "Agree that anything to the 0 is 1, including 0 to the 0 for this lesson. Say that this is a teaching choice.",
    "Trace 2 to the 3 as 2 * 2 * 2 * 1.",
    "If multiply from the last module exists, they may call it. The * operator is also fine here. The lesson is the recursion.",
  ],
  watch: "Base case returns 0, so every power is 0. Also recursing on the base instead of the exponent.",
  done: "2 to the 3 is 8, 5 to the 0 is 1, and they can name the base case.",
}, `def power(a, b):
    if b == 0:
        return 1
    return a * power(a, b - 1)

print(power(2, 3))
print(power(5, 0))
`, J(`System.out.println(power(2, 3));
System.out.println(power(5, 0));`, `static int power(int a, int b) {
    if (b == 0) return 1;
    return a * power(a, b - 1);
}`), C(`printf("%d\\n", power(2, 3));
printf("%d\\n", power(5, 0));`, `int power(int a, int b) {
    if (b == 0) return 1;
    return a * power(a, b - 1);
}`));

add(5, U5, "recursive-digits", "Recursive Digits", {
  say: "A number has one digit, plus however many digits are in the number with the last digit removed.",
  goal: "Return the number of digits using recursion. 0 has one digit.",
  steps: [
    "n // 10 throws away the last digit. Have them do 100, 10, 1, 0 on paper.",
    "The base case is n < 10, return 1. That covers 0 through 9.",
    "Compare the result with the loop version from How Many Digits if they wrote it.",
  ],
  watch: "Base case n == 0 returns 0, which makes 10 report 1. Also an extra + 1 outside the recursion so the count doubles.",
  done: "0, 7, 10, and 100 return 1, 1, 2, and 3.",
}, `def digits(n):
    if n < 10:
        return 1
    return 1 + digits(n // 10)

for n in (0, 7, 10, 100):
    print(n, digits(n))
`, J(`System.out.println("0 " + digits(0));
System.out.println("7 " + digits(7));
System.out.println("10 " + digits(10));
System.out.println("100 " + digits(100));`, `static int digits(int n) {
    if (n < 10) return 1;
    return 1 + digits(n / 10);
}`), C(`printf("0 %d\\n", digits(0));
printf("7 %d\\n", digits(7));
printf("10 %d\\n", digits(10));
printf("100 %d\\n", digits(100));`, `int digits(int n) {
    if (n < 10) return 1;
    return 1 + digits(n / 10);
}`));

add(5, U5, "recursive-fibonacci", "Recursive Fibonacci", {
  say: "The recursive Fibonacci calls itself twice. That is correct and slow. The slowness is part of the lesson.",
  goal: "Return the nth Fibonacci number with two recursive calls, starting fib(0) = 0 and fib(1) = 1.",
  steps: [
    "Draw the call tree for fib(4) before they run fib(10). They should see repeated work.",
    "Do not let them switch to the loop version until the tree version works. The loop was an earlier module.",
    "Ask why fib(6) does so much more work than fib(5). The answer is the two branches, not a bug.",
  ],
  watch: "Only one recursive call, which is the loop version in disguise. Also fib(1) falling through to the recursive case.",
  done: "fib(0) through fib(6) match 0, 1, 1, 2, 3, 5, 8, and they can sketch the fib(4) tree.",
}, `def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

for n in range(7):
    print(n, fib(n))
`, J(`for (int n = 0; n < 7; n++) System.out.println(n + " " + fib(n));`, `static int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}`), C(`int n;
for (n = 0; n < 7; n++) printf("%d %d\\n", n, fib(n));`, `int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}`));

add(5, U5, "recursive-palindrome", "Recursive Palindromes", {
  say: "A word is a palindrome if the outside letters match and the inside is a palindrome. A word of 0 or 1 letters is done.",
  goal: "Check a palindrome by recursion on the inside of the string, not with a loop.",
  steps: [
    "Write the two indexes on the board. Each call moves them inward.",
    "Base case: the indexes have met or crossed.",
    "Test level, noon, and train.",
  ],
  watch: "They still write a while loop inside the function. Also slicing a new string every call is allowed in Python, but have them say that the new string is the smaller problem.",
  done: "They can show the smaller string or the moved indexes for each call on 'level'.",
}, `def palindrome(word, left, right):
    if left >= right:
        return True
    if word[left] != word[right]:
        return False
    return palindrome(word, left + 1, right - 1)

word = input("Word: ").strip().lower()
print("yes" if palindrome(word, 0, len(word) - 1) else "no")
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Word: ");
String word = in.nextLine().trim().toLowerCase();
System.out.println(palindrome(word, 0, word.length() - 1) ? "yes" : "no");`, `static boolean palindrome(String word, int left, int right) {
    if (left >= right) return true;
    if (word.charAt(left) != word.charAt(right)) return false;
    return palindrome(word, left + 1, right - 1);
}`), C(`char word[64];
printf("Word: ");
scanf("%63s", word);
printf("%s\\n", palindrome(word, 0, (int) strlen(word) - 1) ? "yes" : "no");`, `int palindrome(const char *word, int left, int right) {
    if (left >= right) return 1;
    if (word[left] != word[right]) return 0;
    return palindrome(word, left + 1, right - 1);
}`, ["stdio.h", "string.h"]));

add(5, U5, "recursion-projects", "Large Projects", {
  say: "A large recursive project still has one base case and one smaller problem. The size is in the data, not in extra cleverness.",
  goal: "Flood-fill a small grid: from a start cell, mark every connected 0 as visited.",
  steps: [
    "Draw a 4 by 4 grid with a wall of 1s. Pick a start. Circle the cells the flood should reach.",
    "The function marks the current cell, then calls itself up, down, left, and right.",
    "Base cases: off the grid, a wall, or an already marked cell. All three are required.",
  ],
  watch: "They forget the already-marked check and recurse forever. Also they mark the cell after the recursive calls, so the stop never sees the mark.",
  done: "The printed grid matches the circles on the paper, and a wall stops the flood.",
}, `def flood(grid, r, c):
    if r < 0 or c < 0 or r >= len(grid) or c >= len(grid[0]) or grid[r][c] != 0:
        return
    grid[r][c] = 2
    flood(grid, r - 1, c)
    flood(grid, r + 1, c)
    flood(grid, r, c - 1)
    flood(grid, r, c + 1)

grid = [[0, 0, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [1, 1, 0, 0]]
flood(grid, 0, 0)
for row in grid:
    print(row)
`, J(`int[][] grid = {{0, 0, 1, 0}, {0, 1, 1, 0}, {0, 0, 0, 0}, {1, 1, 0, 0}};
flood(grid, 0, 0);
for (int[] row : grid) {
    for (int cell : row) System.out.print(cell + " ");
    System.out.println();
}`, `static void flood(int[][] grid, int r, int c) {
    if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || grid[r][c] != 0) return;
    grid[r][c] = 2;
    flood(grid, r - 1, c);
    flood(grid, r + 1, c);
    flood(grid, r, c - 1);
    flood(grid, r, c + 1);
}`), C(`int grid[4][4] = {{0, 0, 1, 0}, {0, 1, 1, 0}, {0, 0, 0, 0}, {1, 1, 0, 0}};
int r, c;
flood(grid, 0, 0);
for (r = 0; r < 4; r++) {
    for (c = 0; c < 4; c++) printf("%d ", grid[r][c]);
    printf("\\n");
}`, `void flood(int grid[4][4], int r, int c) {
    if (r < 0 || c < 0 || r >= 4 || c >= 4 || grid[r][c] != 0) return;
    grid[r][c] = 2;
    flood(grid, r - 1, c);
    flood(grid, r + 1, c);
    flood(grid, r, c - 1);
    flood(grid, r, c + 1);
}`));

add(5, U5, "hanoi", "Towers of Hanoi", {
  say: "To move n disks from A to C, move n - 1 to the spare, move the bottom disk, then move n - 1 on top. Do not look for a shortcut.",
  goal: "Print the moves for n disks. Test n = 1, then n = 3.",
  steps: [
    "Act it out with three coins or three scraps of paper. n = 1 is one move. n = 2 is three moves.",
    "The print is only the single disk move. The recursive calls move the tower.",
    "Count the printed moves for n = 3. There should be 7.",
  ],
  watch: "They swap the spare and the target in one call but not the other. Have them name the pegs in the call, not just the variables.",
  done: "n = 1 prints one move, n = 3 prints 7, and the largest disk moves only once.",
}, `def hanoi(n, src, dst, spare):
    if n == 0:
        return
    hanoi(n - 1, src, spare, dst)
    print(src, "->", dst)
    hanoi(n - 1, spare, dst, src)

hanoi(int(input("Disks: ")), "A", "C", "B")
`, J(`Scanner in = new Scanner(System.in);
System.out.print("Disks: ");
hanoi(Integer.parseInt(in.nextLine().trim()), "A", "C", "B");`, `static void hanoi(int n, String src, String dst, String spare) {
    if (n == 0) return;
    hanoi(n - 1, src, spare, dst);
    System.out.println(src + " -> " + dst);
    hanoi(n - 1, spare, dst, src);
}`), C(`int n;
printf("Disks: ");
scanf("%d", &n);
hanoi(n, 'A', 'C', 'B');`, `void hanoi(int n, char src, char dst, char spare) {
    if (n == 0) return;
    hanoi(n - 1, src, spare, dst);
    printf("%c -> %c\\n", src, dst);
    hanoi(n - 1, spare, dst, src);
}`));

add(5, U5, "binary-search", "Binary Search", {
  say: "On a sorted list, look at the middle. If it is too small, the answer is to the right. If it is too big, the answer is to the left.",
  goal: "Find a number in a sorted list by recursion or by a loop that halves the range. Print the index or not found.",
  steps: [
    "Write a sorted list on the board. Search for a value that is present and one that is missing.",
    "The list must stay sorted. If they insert out of order, stop and sort it. Do not 'fix' binary search.",
    "Have them say the range that remains after each look.",
  ],
  watch: "An unsorted list, and a mid calculation that uses (low + high) / 2 but then fails to move low or high past mid, so it loops.",
  done: "They find 7, miss 6, and can say which half they threw away.",
}, `def search(nums, target, low, high):
    if low > high:
        return -1
    mid = (low + high) // 2
    if nums[mid] == target:
        return mid
    if nums[mid] < target:
        return search(nums, target, mid + 1, high)
    return search(nums, target, low, mid - 1)

nums = [1, 3, 5, 7, 9, 11]
print(search(nums, 7, 0, len(nums) - 1))
print(search(nums, 6, 0, len(nums) - 1))
`, J(`int[] nums = {1, 3, 5, 7, 9, 11};
System.out.println(search(nums, 7, 0, nums.length - 1));
System.out.println(search(nums, 6, 0, nums.length - 1));`, `static int search(int[] nums, int target, int low, int high) {
    if (low > high) return -1;
    int mid = (low + high) / 2;
    if (nums[mid] == target) return mid;
    if (nums[mid] < target) return search(nums, target, mid + 1, high);
    return search(nums, target, low, mid - 1);
}`), C(`int nums[] = {1, 3, 5, 7, 9, 11};
printf("%d\\n", search(nums, 7, 0, 5));
printf("%d\\n", search(nums, 6, 0, 5));`, `int search(int *nums, int target, int low, int high) {
    int mid;
    if (low > high) return -1;
    mid = (low + high) / 2;
    if (nums[mid] == target) return mid;
    if (nums[mid] < target) return search(nums, target, mid + 1, high);
    return search(nums, target, low, mid - 1);
}`));

add(5, U5, "simple-sorts", "Insertion, Bubble, and Selection", {
  say: "These three sorts are slow and visible. The student should be able to act each one out with cards before the code is trusted.",
  goal: "Implement insertion, bubble, and selection, and print the list after each outer pass of bubble sort.",
  steps: [
    "Sort the same five numbers three ways: 4, 1, 3, 2. Agree on the paper result first.",
    "Bubble: neighbors swap, and you print after each pass. Selection: find the minimum and swap it into place. Insertion: pull one value backward into the sorted side.",
    "Ask which one they can perform with cards without erasing. That is the one they understand.",
  ],
  watch: "An inner loop that starts at 0 and undoes the sorted side. Also swapping with a copy so the original value is lost.",
  done: "All three end at 1 2 3 4, and the bubble prints show the large value moving right.",
}, `def bubble(nums):
    items = nums[:]
    for pass_n in range(len(items)):
        for i in range(len(items) - 1 - pass_n):
            if items[i] > items[i + 1]:
                items[i], items[i + 1] = items[i + 1], items[i]
        print("bubble", items)
    return items

def selection(nums):
    items = nums[:]
    for i in range(len(items)):
        small = i
        for j in range(i + 1, len(items)):
            if items[j] < items[small]:
                small = j
        items[i], items[small] = items[small], items[i]
    return items

def insertion(nums):
    items = nums[:]
    for i in range(1, len(items)):
        key = items[i]
        j = i - 1
        while j >= 0 and items[j] > key:
            items[j + 1] = items[j]
            j -= 1
        items[j + 1] = key
    return items

start = [4, 1, 3, 2]
bubble(start)
print("selection", selection(start))
print("insertion", insertion(start))
`, J(`int[] start = {4, 1, 3, 2};
bubble(start.clone());
System.out.print("selection ");
printNums(selection(start.clone()));
System.out.print("insertion ");
printNums(insertion(start.clone()));`, `static void printNums(int[] items) {
    for (int n : items) System.out.print(n + " ");
    System.out.println();
}
static void bubble(int[] items) {
    for (int pass = 0; pass < items.length; pass++) {
        for (int i = 0; i < items.length - 1 - pass; i++) {
            if (items[i] > items[i + 1]) {
                int tmp = items[i];
                items[i] = items[i + 1];
                items[i + 1] = tmp;
            }
        }
        System.out.print("bubble ");
        printNums(items);
    }
}
static int[] selection(int[] items) {
    for (int i = 0; i < items.length; i++) {
        int small = i;
        for (int j = i + 1; j < items.length; j++) if (items[j] < items[small]) small = j;
        int tmp = items[i];
        items[i] = items[small];
        items[small] = tmp;
    }
    return items;
}
static int[] insertion(int[] items) {
    for (int i = 1; i < items.length; i++) {
        int key = items[i], j = i - 1;
        while (j >= 0 && items[j] > key) {
            items[j + 1] = items[j];
            j -= 1;
        }
        items[j + 1] = key;
    }
    return items;
}`), C(`int start[] = {4, 1, 3, 2};
int copy[4];
copy_nums(start, copy);
bubble(copy, 4);
copy_nums(start, copy);
selection(copy, 4);
printf("selection ");
print_nums(copy, 4);
copy_nums(start, copy);
insertion(copy, 4);
printf("insertion ");
print_nums(copy, 4);`, `void print_nums(int *items, int n) {
    int i;
    for (i = 0; i < n; i++) printf("%d ", items[i]);
    printf("\\n");
}
void copy_nums(int *src, int *dst) {
    int i;
    for (i = 0; i < 4; i++) dst[i] = src[i];
}
void bubble(int *items, int n) {
    int pass, i, tmp;
    for (pass = 0; pass < n; pass++) {
        for (i = 0; i < n - 1 - pass; i++) if (items[i] > items[i + 1]) {
            tmp = items[i];
            items[i] = items[i + 1];
            items[i + 1] = tmp;
        }
        printf("bubble ");
        print_nums(items, n);
    }
}
void selection(int *items, int n) {
    int i, j, small, tmp;
    for (i = 0; i < n; i++) {
        small = i;
        for (j = i + 1; j < n; j++) if (items[j] < items[small]) small = j;
        tmp = items[i];
        items[i] = items[small];
        items[small] = tmp;
    }
}
void insertion(int *items, int n) {
    int i, j, key;
    for (i = 1; i < n; i++) {
        key = items[i];
        j = i - 1;
        while (j >= 0 && items[j] > key) {
            items[j + 1] = items[j];
            j -= 1;
        }
        items[j + 1] = key;
    }
}`));

add(5, U5, "mergesort", "MergeSort", {
  say: "Split until each piece has one item. Merge two sorted pieces by always taking the smaller front.",
  goal: "Sort a list with mergesort and show one merge by hand before trusting the code.",
  steps: [
    "Merge [2, 5] and [1, 4] on paper. The result is 1, 2, 4, 5. That merge is the whole algorithm.",
    "Then write merge. Only after merge works, write the split.",
    "Java and C need extra space for the merged side. Say that out loud. It is not a waste.",
  ],
  watch: "They merge by sorting the combined list with bubble sort. That is not mergesort. The merge itself must walk the two fronts.",
  done: "The paper merge matches the function, and the full sort of 4, 1, 3, 2 is 1, 2, 3, 4.",
}, `def merge(left, right):
    out = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i])
            i += 1
        else:
            out.append(right[j])
            j += 1
    return out + left[i:] + right[j:]

def mergesort(nums):
    if len(nums) <= 1:
        return nums
    mid = len(nums) // 2
    return merge(mergesort(nums[:mid]), mergesort(nums[mid:]))

print(merge([2, 5], [1, 4]))
print(mergesort([4, 1, 3, 2]))
`, J(`System.out.println("merge then sort");
int[] nums = {4, 1, 3, 2};
mergesort(nums, 0, nums.length - 1);
for (int n : nums) System.out.print(n + " ");
System.out.println();`, `static void merge(int[] nums, int low, int mid, int high) {
    int[] extra = new int[high - low + 1];
    int i = low, j = mid + 1, k = 0;
    while (i <= mid && j <= high) extra[k++] = nums[i] <= nums[j] ? nums[i++] : nums[j++];
    while (i <= mid) extra[k++] = nums[i++];
    while (j <= high) extra[k++] = nums[j++];
    for (int t = 0; t < extra.length; t++) nums[low + t] = extra[t];
}
static void mergesort(int[] nums, int low, int high) {
    if (low >= high) return;
    int mid = (low + high) / 2;
    mergesort(nums, low, mid);
    mergesort(nums, mid + 1, high);
    merge(nums, low, mid, high);
}`), C(`int nums[] = {4, 1, 3, 2};
int i;
mergesort(nums, 0, 3);
for (i = 0; i < 4; i++) printf("%d ", nums[i]);
printf("\\n");`, `void merge(int *nums, int low, int mid, int high) {
    int extra[32], i = low, j = mid + 1, k = 0, t;
    while (i <= mid && j <= high) extra[k++] = nums[i] <= nums[j] ? nums[i++] : nums[j++];
    while (i <= mid) extra[k++] = nums[i++];
    while (j <= high) extra[k++] = nums[j++];
    for (t = 0; t < k; t++) nums[low + t] = extra[t];
}
void mergesort(int *nums, int low, int high) {
    int mid;
    if (low >= high) return;
    mid = (low + high) / 2;
    mergesort(nums, low, mid);
    mergesort(nums, mid + 1, high);
    merge(nums, low, mid, high);
}`));

add(5, U5, "quicksort", "QuickSort", {
  say: "Pick a pivot. Put smaller values on the left and larger values on the right. Then sort the two sides. Do not sort the pivot again.",
  goal: "Sort a list with quicksort and be able to show the two sides after the first split.",
  steps: [
    "Use the last item as the pivot so everyone uses the same rule.",
    "Print the list after the first partition of 4, 1, 3, 2. The pivot 2 should have only smaller values on its left.",
    "Then let recursion sort the sides. If the first partition is wrong, recursion will hide it. Check the partition first.",
  ],
  watch: "The pivot is included in both recursive calls, so it is moved forever. Also a partition that swaps but never returns the pivot index.",
  done: "The first partition puts 2 in its final place, and the full sort ends sorted.",
}, `def partition(nums, low, high):
    pivot = nums[high]
    i = low
    for j in range(low, high):
        if nums[j] <= pivot:
            nums[i], nums[j] = nums[j], nums[i]
            i += 1
    nums[i], nums[high] = nums[high], nums[i]
    return i

def quicksort(nums, low, high):
    if low >= high:
        return
    pivot = partition(nums, low, high)
    quicksort(nums, low, pivot - 1)
    quicksort(nums, pivot + 1, high)

nums = [4, 1, 3, 2]
print("pivot index", partition(nums[:], 0, 3))
quicksort(nums, 0, len(nums) - 1)
print(nums)
`, J(`int[] nums = {4, 1, 3, 2};
quicksort(nums, 0, nums.length - 1);
for (int n : nums) System.out.print(n + " ");
System.out.println();`, `static int partition(int[] nums, int low, int high) {
    int pivot = nums[high], i = low;
    for (int j = low; j < high; j++) {
        if (nums[j] <= pivot) {
            int tmp = nums[i];
            nums[i] = nums[j];
            nums[j] = tmp;
            i += 1;
        }
    }
    int tmp = nums[i];
    nums[i] = nums[high];
    nums[high] = tmp;
    return i;
}
static void quicksort(int[] nums, int low, int high) {
    if (low >= high) return;
    int pivot = partition(nums, low, high);
    quicksort(nums, low, pivot - 1);
    quicksort(nums, pivot + 1, high);
}`), C(`int nums[] = {4, 1, 3, 2};
int i;
quicksort(nums, 0, 3);
for (i = 0; i < 4; i++) printf("%d ", nums[i]);
printf("\\n");`, `int partition(int *nums, int low, int high) {
    int pivot = nums[high], i = low, j, tmp;
    for (j = low; j < high; j++) if (nums[j] <= pivot) {
        tmp = nums[i];
        nums[i] = nums[j];
        nums[j] = tmp;
        i += 1;
    }
    tmp = nums[i];
    nums[i] = nums[high];
    nums[high] = tmp;
    return i;
}
void quicksort(int *nums, int low, int high) {
    int pivot;
    if (low >= high) return;
    pivot = partition(nums, low, high);
    quicksort(nums, low, pivot - 1);
    quicksort(nums, pivot + 1, high);
}`));

add(6, U6, "point", "Point", {
  say: "A point is an object with x and y. The functions that move it belong with the data, not loose in main.",
  goal: "Make a Point that can move and report its distance to another point.",
  steps: [
    "Create one point and print it before you write distance. If they cannot print it, the object is not real yet.",
    "Move it by dx, dy. Show that main does not touch x directly if move() exists. Then show that it still can, and decide the rule together.",
    "Distance uses the other point as a parameter. Test (0, 0) to (3, 4). The answer is 5.",
  ],
  watch: "A function that takes four loose numbers instead of two points. Also integer distance that truncates 5.0 into something they did not expect. Use a double or float.",
  done: "Moving the point changes the printed coordinates, and distance(0,0) to (3,4) is 5.",
}, `import math

class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def move(self, dx, dy):
        self.x += dx
        self.y += dy

    def distance(self, other):
        return math.hypot(self.x - other.x, self.y - other.y)

    def __str__(self):
        return f"({self.x}, {self.y})"

a = Point(0, 0)
b = Point(3, 4)
print(a, b, a.distance(b))
a.move(1, 1)
print(a)
`, `class Point {
    double x, y;
    Point(double x, double y) { this.x = x; this.y = y; }
    void move(double dx, double dy) { x += dx; y += dy; }
    double distance(Point other) {
        return Math.hypot(x - other.x, y - other.y);
    }
    public String toString() { return "(" + x + ", " + y + ")"; }
}

public class Guide {
    public static void main(String[] args) {
        Point a = new Point(0, 0);
        Point b = new Point(3, 4);
        System.out.println(a + " " + b + " " + a.distance(b));
        a.move(1, 1);
        System.out.println(a);
    }
}
`, `#include <stdio.h>
#include <math.h>

typedef struct { double x, y; } Point;

void move(Point *p, double dx, double dy) {
    p->x += dx;
    p->y += dy;
}

double distance(Point a, Point b) {
    return hypot(a.x - b.x, a.y - b.y);
}

int main() {
    Point a = {0, 0}, b = {3, 4};
    printf("(%.0f, %.0f) (%.0f, %.0f) %.1f\\n", a.x, a.y, b.x, b.y, distance(a, b));
    move(&a, 1, 1);
    printf("(%.0f, %.0f)\\n", a.x, a.y);
    return 0;
}
`);

add(6, U6, "card-deck", "Card & Deck", {
  say: "A card is rank and suit. A deck is a list of cards plus shuffle and draw. Main should not build the deck by hand each time.",
  goal: "Build a 52-card deck, shuffle it, and draw five cards.",
  steps: [
    "Print one card first, like 10 of hearts. Agree how ranks and suits are stored.",
    "Fill the deck with two loops: 4 suits, 13 ranks. Count the deck. It must be 52 before shuffle.",
    "Draw removes a card. If draw does not shrink the deck, they will deal the same card forever.",
  ],
  watch: "Shuffle that only swaps the first two cards. Have them print the first five before and after shuffle. Also an off-by-one so there is no king or no ace.",
  done: "The deck starts at 52, five draws leave 47, and a second run is not in the same order.",
}, `import random

class Card:
    def __init__(self, rank, suit):
        self.rank = rank
        self.suit = suit
    def __str__(self):
        return f"{self.rank} of {self.suit}"

class Deck:
    def __init__(self):
        ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
        suits = ["hearts", "diamonds", "clubs", "spades"]
        self.cards = [Card(rank, suit) for suit in suits for rank in ranks]
    def shuffle(self):
        random.shuffle(self.cards)
    def draw(self):
        return self.cards.pop()

deck = Deck()
print("cards", len(deck.cards))
deck.shuffle()
for _ in range(5):
    print(deck.draw())
print("left", len(deck.cards))
`, `import java.util.ArrayList;
import java.util.Collections;

class Card {
    String rank, suit;
    Card(String rank, String suit) { this.rank = rank; this.suit = suit; }
    public String toString() { return rank + " of " + suit; }
}

class Deck {
    ArrayList<Card> cards = new ArrayList<>();
    Deck() {
        String[] ranks = {"A","2","3","4","5","6","7","8","9","10","J","Q","K"};
        String[] suits = {"hearts","diamonds","clubs","spades"};
        for (String suit : suits) for (String rank : ranks) cards.add(new Card(rank, suit));
    }
    void shuffle() { Collections.shuffle(cards); }
    Card draw() { return cards.remove(cards.size() - 1); }
}

public class Guide {
    public static void main(String[] args) {
        Deck deck = new Deck();
        System.out.println("cards " + deck.cards.size());
        deck.shuffle();
        for (int i = 0; i < 5; i++) System.out.println(deck.draw());
        System.out.println("left " + deck.cards.size());
    }
}
`, `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct { char rank[4]; char suit[12]; } Card;

typedef struct { Card cards[52]; int count; } Deck;

void build(Deck *deck) {
    const char *ranks[] = {"A","2","3","4","5","6","7","8","9","10","J","Q","K"};
    const char *suits[] = {"hearts","diamonds","clubs","spades"};
    int s, r, n = 0;
    for (s = 0; s < 4; s++) for (r = 0; r < 13; r++) {
        snprintf(deck->cards[n].rank, 4, "%s", ranks[r]);
        snprintf(deck->cards[n].suit, 12, "%s", suits[s]);
        n++;
    }
    deck->count = 52;
}

void shuffle(Deck *deck) {
    int i;
    for (i = deck->count - 1; i > 0; i--) {
        int j = rand() % (i + 1);
        Card tmp = deck->cards[i];
        deck->cards[i] = deck->cards[j];
        deck->cards[j] = tmp;
    }
}

int main() {
    Deck deck;
    int i;
    srand((unsigned) time(NULL));
    build(&deck);
    printf("cards %d\\n", deck.count);
    shuffle(&deck);
    for (i = 0; i < 5; i++) {
        deck.count -= 1;
        printf("%s of %s\\n", deck.cards[deck.count].rank, deck.cards[deck.count].suit);
    }
    printf("left %d\\n", deck.count);
    return 0;
}
`);

add(6, U6, "war", "War", {
  say: "War is a deck split in half. Each round the higher card wins both. A tie can be the simple rule today: both cards go back to their owners.",
  goal: "Play a short War and print the winner when one player runs out, or stop after 20 rounds so class does not hang.",
  steps: [
    "Use their Deck. Split it into two piles. Do not shuffle after the split or the deal was pointless.",
    "Compare rank, not the printed word. Store a numeric value on the card or look it up.",
    "Cap the game at 20 rounds and say why: a naive War can loop for a long time.",
  ],
  watch: "Comparing the string '10' and '9' alphabetically. 10 must beat 9. Also putting won cards back on the top, which changes the game. Put them on the bottom.",
  done: "They can point at the line that awards both cards, and a tie does not crash or delete the cards.",
}, `import random

RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

def value(card):
    return RANKS.index(card[0])

cards = [(rank, suit) for suit in "HDCS" for rank in RANKS]
random.shuffle(cards)
a, b = cards[:26], cards[26:]
for round_n in range(1, 21):
    if not a or not b:
        break
    left, right = a.pop(0), b.pop(0)
    if value(left) > value(right):
        a.extend([left, right])
        winner = "A"
    elif value(right) > value(left):
        b.extend([right, left])
        winner = "B"
    else:
        a.append(left)
        b.append(right)
        winner = "tie"
    print(round_n, left[0], right[0], winner, len(a), len(b))
print("A" if len(a) > len(b) else "B", "has more cards")
`, `import java.util.*;

public class Guide {
    static int value(String rank) {
        String[] ranks = {"A","2","3","4","5","6","7","8","9","10","J","Q","K"};
        for (int i = 0; i < ranks.length; i++) if (ranks[i].equals(rank)) return i;
        return -1;
    }
    public static void main(String[] args) {
        ArrayList<String> cards = new ArrayList<>();
        String[] ranks = {"A","2","3","4","5","6","7","8","9","10","J","Q","K"};
        for (String suit : new String[]{"H","D","C","S"}) for (String rank : ranks) cards.add(rank + suit);
        Collections.shuffle(cards);
        ArrayDeque<String> a = new ArrayDeque<>(cards.subList(0, 26));
        ArrayDeque<String> b = new ArrayDeque<>(cards.subList(26, 52));
        for (int round = 1; round <= 20 && !a.isEmpty() && !b.isEmpty(); round++) {
            String left = a.removeFirst(), right = b.removeFirst();
            String winner;
            if (value(left.substring(0, left.length() - 1)) > value(right.substring(0, right.length() - 1))) {
                a.addLast(left); a.addLast(right); winner = "A";
            } else if (value(right.substring(0, right.length() - 1)) > value(left.substring(0, left.length() - 1))) {
                b.addLast(right); b.addLast(left); winner = "B";
            } else {
                a.addLast(left); b.addLast(right); winner = "tie";
            }
            System.out.println(round + " " + left + " " + right + " " + winner + " " + a.size() + " " + b.size());
        }
        System.out.println((a.size() >= b.size() ? "A" : "B") + " has more cards");
    }
}
`, `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

int value(const char *card) {
    const char *ranks[] = {"A","2","3","4","5","6","7","8","9","10","J","Q","K"};
    char rank[4];
    int i, n = (int) strlen(card) - 1;
    if (n > 3) n = 3;
    snprintf(rank, n + 1, "%s", card);
    for (i = 0; i < 13; i++) if (strcmp(rank, ranks[i]) == 0) return i;
    return -1;
}

int main() {
    char cards[52][4], a[52][4], b[52][4];
    int i, s, r, n = 0, aCount, bCount, round, ia = 0, ib = 0;
    const char *ranks[] = {"A","2","3","4","5","6","7","8","9","10","J","Q","K"};
    const char *suits = "HDCS";
    srand((unsigned) time(NULL));
    for (s = 0; s < 4; s++) for (r = 0; r < 13; r++) snprintf(cards[n++], 4, "%s%c", ranks[r], suits[s]);
    for (i = 51; i > 0; i--) {
        int j = rand() % (i + 1);
        char tmp[4];
        strcpy(tmp, cards[i]); strcpy(cards[i], cards[j]); strcpy(cards[j], tmp);
    }
    for (i = 0; i < 26; i++) { strcpy(a[i], cards[i]); strcpy(b[i], cards[i + 26]); }
    aCount = bCount = 26;
    for (round = 1; round <= 20 && aCount && bCount; round++) {
        char left[4], right[4];
        strcpy(left, a[ia]); strcpy(right, b[ib]);
        ia = (ia + 1) % 52; ib = (ib + 1) % 52; aCount--; bCount--;
        printf("%d %s %s ", round, left, right);
        if (value(left) > value(right)) { strcpy(a[(ia + aCount) % 52], left); strcpy(a[(ia + aCount + 1) % 52], right); aCount += 2; printf("A\\n"); }
        else if (value(right) > value(left)) { strcpy(b[(ib + bCount) % 52], right); strcpy(b[(ib + bCount + 1) % 52], left); bCount += 2; printf("B\\n"); }
        else { strcpy(a[(ia + aCount) % 52], left); strcpy(b[(ib + bCount) % 52], right); aCount++; bCount++; printf("tie\\n"); }
    }
    printf("%s has more cards\\n", aCount >= bCount ? "A" : "B");
    return 0;
}
`);

add(6, U6, "blackjack", "Blackjack", {
  say: "Blackjack is a hand object that can add a card and report its value. Aces are 11 until the hand would bust, then they become 1.",
  goal: "One player hits or stands. The dealer hits while under 17. Print both totals and the winner.",
  steps: [
    "Write hand value with no aces first. Then add the ace rule and test a hand of ace + 9 + ace.",
    "The player loop is hit or stand. A bust ends the hand immediately. Do not let them hit after 21.",
    "Dealer second. Dealer does not ask the player. The rule is the code.",
  ],
  watch: "Ace is always 11, so ace + 6 + 10 busts a hand that should be 17. Also the dealer playing before the player stands.",
  done: "They can explain an ace that changed from 11 to 1, and a bust does not continue.",
}, `import random

def fresh():
    return random.randint(1, 13)

def value(cards):
    total = 0
    aces = 0
    for card in cards:
        if card == 1:
            aces += 1
            total += 11
        else:
            total += min(card, 10)
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return total

player = [fresh(), fresh()]
dealer = [fresh(), fresh()]
while True:
    print("You", player, value(player))
    if value(player) >= 21:
        break
    if input("hit or stand: ").strip().lower() != "hit":
        break
    player.append(fresh())
if value(player) <= 21:
    while value(dealer) < 17:
        dealer.append(fresh())
print("Dealer", dealer, value(dealer))
if value(player) > 21:
    print("You bust")
elif value(dealer) > 21 or value(player) > value(dealer):
    print("You win")
elif value(player) == value(dealer):
    print("Push")
else:
    print("Dealer wins")
`, `import java.util.*;

public class Guide {
    static int fresh(Random random) { return random.nextInt(13) + 1; }
    static int value(ArrayList<Integer> cards) {
        int total = 0, aces = 0;
        for (int card : cards) {
            if (card == 1) { aces++; total += 11; }
            else total += Math.min(card, 10);
        }
        while (total > 21 && aces > 0) { total -= 10; aces--; }
        return total;
    }
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        Random random = new Random();
        ArrayList<Integer> player = new ArrayList<>(), dealer = new ArrayList<>();
        player.add(fresh(random)); player.add(fresh(random));
        dealer.add(fresh(random)); dealer.add(fresh(random));
        while (true) {
            System.out.println("You " + player + " " + value(player));
            if (value(player) >= 21) break;
            System.out.print("hit or stand: ");
            if (!in.nextLine().trim().equalsIgnoreCase("hit")) break;
            player.add(fresh(random));
        }
        if (value(player) <= 21) while (value(dealer) < 17) dealer.add(fresh(random));
        System.out.println("Dealer " + dealer + " " + value(dealer));
        if (value(player) > 21) System.out.println("You bust");
        else if (value(dealer) > 21 || value(player) > value(dealer)) System.out.println("You win");
        else if (value(player) == value(dealer)) System.out.println("Push");
        else System.out.println("Dealer wins");
    }
}
`, `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

int fresh(void) { return rand() % 13 + 1; }

int hand_value(int *cards, int n) {
    int i, total = 0, aces = 0;
    for (i = 0; i < n; i++) {
        if (cards[i] == 1) { aces++; total += 11; }
        else total += cards[i] > 10 ? 10 : cards[i];
    }
    while (total > 21 && aces) { total -= 10; aces--; }
    return total;
}

int main() {
    int player[12], dealer[12], pn = 2, dn = 2, i;
    char choice[16];
    srand((unsigned) time(NULL));
    player[0] = fresh(); player[1] = fresh();
    dealer[0] = fresh(); dealer[1] = fresh();
    while (1) {
        printf("You");
        for (i = 0; i < pn; i++) printf(" %d", player[i]);
        printf(" total %d\\n", hand_value(player, pn));
        if (hand_value(player, pn) >= 21) break;
        printf("hit or stand: ");
        scanf("%15s", choice);
        if (strcmp(choice, "hit") != 0) break;
        player[pn++] = fresh();
    }
    if (hand_value(player, pn) <= 21) while (hand_value(dealer, dn) < 17 && dn < 12) dealer[dn++] = fresh();
    printf("Dealer");
    for (i = 0; i < dn; i++) printf(" %d", dealer[i]);
    printf(" total %d\\n", hand_value(dealer, dn));
    if (hand_value(player, pn) > 21) printf("You bust\\n");
    else if (hand_value(dealer, dn) > 21 || hand_value(player, pn) > hand_value(dealer, dn)) printf("You win\\n");
    else if (hand_value(player, pn) == hand_value(dealer, dn)) printf("Push\\n");
    else printf("Dealer wins\\n");
    return 0;
}
`);

add(6, U6, "minesweeper", "Minesweeper", {
  say: "The board stores mines. A second grid stores what the player has revealed. The number in a cell is a count of neighboring mines, computed, not stored as the only data.",
  goal: "Place mines, reveal a cell, and print the visible board. Hitting a mine ends the game.",
  steps: [
    "Use a 5 by 5 board and 4 mines so you can see the whole thing. Do not start at 16 by 16.",
    "Write neighbor count and test it on a board you filled by hand before you add random mines.",
    "Reveal only changes the visible grid. The mine grid stays secret.",
  ],
  watch: "They store the count in the same grid as the mine and then cannot tell a counted 1 from a mine. Two grids.",
  done: "A safe reveal shows a number or a blank, a mine reveal ends the game, and the hidden grid is not printed before then.",
}, `import random

class Board:
    def __init__(self):
        self.mines = [[0] * 5 for _ in range(5)]
        self.seen = [[False] * 5 for _ in range(5)]
        spots = random.sample(range(25), 4)
        for spot in spots:
            self.mines[spot // 5][spot % 5] = 1

    def count(self, r, c):
        total = 0
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                rr, cc = r + dr, c + dc
                if 0 <= rr < 5 and 0 <= cc < 5:
                    total += self.mines[rr][cc]
        return total

    def show(self):
        for r in range(5):
            line = []
            for c in range(5):
                line.append(str(self.count(r, c)) if self.seen[r][c] else "#")
            print(" ".join(line))

board = Board()
while True:
    board.show()
    r, c = [int(part) for part in input("row col: ").split()]
    if board.mines[r][c]:
        print("Mine")
        break
    board.seen[r][c] = True
`, `import java.util.*;

public class Guide {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        Random random = new Random();
        int[][] mines = new int[5][5];
        boolean[][] seen = new boolean[5][5];
        for (int placed = 0; placed < 4; ) {
            int spot = random.nextInt(25);
            if (mines[spot / 5][spot % 5] == 0) { mines[spot / 5][spot % 5] = 1; placed++; }
        }
        while (true) {
            for (int r = 0; r < 5; r++) {
                for (int c = 0; c < 5; c++) System.out.print(seen[r][c] ? count(mines, r, c) + " " : "# ");
                System.out.println();
            }
            System.out.print("row col: ");
            int r = in.nextInt(), c = in.nextInt();
            if (mines[r][c] == 1) { System.out.println("Mine"); break; }
            seen[r][c] = true;
        }
    }
    static int count(int[][] mines, int r, int c) {
        int total = 0;
        for (int dr = -1; dr <= 1; dr++) for (int dc = -1; dc <= 1; dc++) {
            int rr = r + dr, cc = c + dc;
            if (rr >= 0 && cc >= 0 && rr < 5 && cc < 5) total += mines[rr][cc];
        }
        return total;
    }
}
`, `#include <stdio.h>
#include <stdlib.h>
#include <time.h>

int count(int mines[5][5], int r, int c) {
    int dr, dc, total = 0;
    for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) {
        int rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < 5 && cc < 5) total += mines[rr][cc];
    }
    return total;
}

int main() {
    int mines[5][5] = {0}, seen[5][5] = {0}, placed = 0, r, c;
    srand((unsigned) time(NULL));
    while (placed < 4) {
        int spot = rand() % 25;
        if (!mines[spot / 5][spot % 5]) { mines[spot / 5][spot % 5] = 1; placed++; }
    }
    while (1) {
        for (r = 0; r < 5; r++) {
            for (c = 0; c < 5; c++) {
                if (seen[r][c]) printf("%d ", count(mines, r, c));
                else printf("# ");
            }
            printf("\\n");
        }
        printf("row col: ");
        scanf("%d %d", &r, &c);
        if (mines[r][c]) { printf("Mine\\n"); break; }
        seen[r][c] = 1;
    }
    return 0;
}
`);

add(6, U6, "battleship", "Battleship", {
  say: "Each player has a grid of ships and a grid of shots. A shot checks the opponent's ship grid and marks your shot grid.",
  goal: "Place two ships of length 3 on a 5 by 5 grid and let the player shoot until one ship is fully hit or they quit.",
  steps: [
    "Place the ships in code first, horizontally, so you know the answer. Random placement is the extension.",
    "A shot returns hit, miss, or already shot. Already shot must not count as a new hit.",
    "The ship is sunk when all three of its cells are hit. Track hits per ship, or scan the ship cells.",
  ],
  watch: "One grid doing both jobs, so a miss overwrites a ship. Also counting every shot at the same cell as a new hit.",
  done: "They can sink a ship they placed, a repeat shot does not increase the hit count, and a miss is visible.",
}, `ships = [["."] * 5 for _ in range(5)]
shots = [["."] * 5 for _ in range(5)]
for c in range(3):
    ships[1][c] = "A"
    ships[3][c + 1] = "B"
hits = {"A": 0, "B": 0}
while max(hits.values()) < 3:
    for row in shots:
        print(" ".join(row))
    r, c = [int(part) for part in input("row col: ").split()]
    if shots[r][c] != ".":
        print("already")
        continue
    mark = ships[r][c]
    if mark == ".":
        shots[r][c] = "o"
        print("miss")
    else:
        shots[r][c] = "X"
        hits[mark] += 1
        print("hit", mark)
print("sunk")
`, `public class Guide {
    public static void main(String[] args) {
        java.util.Scanner in = new java.util.Scanner(System.in);
        char[][] ships = new char[5][5];
        char[][] shots = new char[5][5];
        for (int r = 0; r < 5; r++) for (int c = 0; c < 5; c++) { ships[r][c] = '.'; shots[r][c] = '.'; }
        for (int c = 0; c < 3; c++) { ships[1][c] = 'A'; ships[3][c + 1] = 'B'; }
        int hitA = 0, hitB = 0;
        while (hitA < 3 && hitB < 3) {
            for (char[] row : shots) {
                for (char cell : row) System.out.print(cell + " ");
                System.out.println();
            }
            System.out.print("row col: ");
            int r = in.nextInt(), c = in.nextInt();
            if (shots[r][c] != '.') { System.out.println("already"); continue; }
            if (ships[r][c] == '.') { shots[r][c] = 'o'; System.out.println("miss"); }
            else {
                shots[r][c] = 'X';
                if (ships[r][c] == 'A') hitA++; else hitB++;
                System.out.println("hit " + ships[r][c]);
            }
        }
        System.out.println("sunk");
    }
}
`, `#include <stdio.h>

int main() {
    char ships[5][5], shots[5][5];
    int r, c, hitA = 0, hitB = 0;
    for (r = 0; r < 5; r++) for (c = 0; c < 5; c++) { ships[r][c] = '.'; shots[r][c] = '.'; }
    for (c = 0; c < 3; c++) { ships[1][c] = 'A'; ships[3][c + 1] = 'B'; }
    while (hitA < 3 && hitB < 3) {
        for (r = 0; r < 5; r++) {
            for (c = 0; c < 5; c++) printf("%c ", shots[r][c]);
            printf("\\n");
        }
        printf("row col: ");
        scanf("%d %d", &r, &c);
        if (shots[r][c] != '.') { printf("already\\n"); continue; }
        if (ships[r][c] == '.') { shots[r][c] = 'o'; printf("miss\\n"); }
        else {
            shots[r][c] = 'X';
            if (ships[r][c] == 'A') hitA++; else hitB++;
            printf("hit %c\\n", ships[r][c]);
        }
    }
    printf("sunk\\n");
    return 0;
}
`);

add(6, U6, "chess", "Chess", {
  say: "Chess is a board plus a rule for each piece. Today the finished core is: print the board, read a move like e2 e4, and reject a move that piece cannot make. Castling, en passant, and checkmate are the extension after this works.",
  goal: "Play legal piece moves for pawn, knight, bishop, rook, queen, and king. Do not land on your own piece. Blocked sliders cannot jump.",
  steps: [
    "Print the starting board with coordinates before any move rule. Players need to see e2.",
    "Write pawn moves first, including the first double step and a capture. Test e2 e4, then an illegal e2 e5.",
    "Add one sliding piece and the path check. A rook that jumps is not done. Knight does not use the path check.",
  ],
  watch: "Ranks numbered from the top of the array. e2 is row 6, column 4, if row 0 is the black back rank. Draw that once.",
  done: "e2 e4 works, a rook cannot jump, a knight can jump, and a piece cannot capture its own color.",
}, `board = [list("rnbqkbnr"), list("pppppppp"), list("........"), list("........"), list("........"), list("........"), list("PPPPPPPP"), list("RNBQKBNR")]

def show():
    print("  a b c d e f g h")
    for r in range(8):
        print(8 - r, " ".join(board[r]))

def square(text):
    if len(text) != 2 or text[0] not in "abcdefgh" or text[1] not in "12345678":
        return None
    return 8 - int(text[1]), ord(text[0]) - 97

def own(a, b):
    return a != "." and b != "." and a.isupper() == b.isupper()

def clear(r1, c1, r2, c2):
    dr = (r2 > r1) - (r2 < r1)
    dc = (c2 > c1) - (c2 < c1)
    r, c = r1 + dr, c1 + dc
    while (r, c) != (r2, c2):
        if board[r][c] != ".":
            return False
        r += dr
        c += dc
    return True

def legal(r1, c1, r2, c2):
    piece, target = board[r1][c1], board[r2][c2]
    if piece == "." or own(piece, target):
        return False
    dr, dc = r2 - r1, c2 - c1
    kind = piece.lower()
    if kind == "p":
        step = -1 if piece.isupper() else 1
        start = 6 if piece.isupper() else 1
        if dc == 0 and target == "." and (dr == step or (dr == 2 * step and r1 == start and board[r1 + step][c1] == ".")):
            return True
        return abs(dc) == 1 and dr == step and target != "."
    if kind == "n":
        return sorted((abs(dr), abs(dc))) == [1, 2]
    if kind == "k":
        return max(abs(dr), abs(dc)) == 1
    straight = (dr == 0 or dc == 0) and (dr or dc)
    diagonal = abs(dr) == abs(dc) and dr != 0
    if kind == "r":
        return straight and clear(r1, c1, r2, c2)
    if kind == "b":
        return diagonal and clear(r1, c1, r2, c2)
    if kind == "q":
        return (straight or diagonal) and clear(r1, c1, r2, c2)
    return False

white = True
while True:
    show()
    raw = input("move: ").split()
    if raw == ["quit"]:
        break
    if len(raw) != 2 or not square(raw[0]) or not square(raw[1]):
        print("use e2 e4")
        continue
    r1, c1 = square(raw[0])
    r2, c2 = square(raw[1])
    piece = board[r1][c1]
    if white != piece.isupper() or not legal(r1, c1, r2, c2):
        print("illegal")
        continue
    board[r2][c2] = piece
    board[r1][c1] = "."
    white = not white
`, `public class Guide {
    static char[][] board = {
        "rnbqkbnr".toCharArray(), "pppppppp".toCharArray(), "........".toCharArray(), "........".toCharArray(),
        "........".toCharArray(), "........".toCharArray(), "PPPPPPPP".toCharArray(), "RNBQKBNR".toCharArray()
    };
    static boolean white(char p) { return p >= 'A' && p <= 'Z'; }
    static int[] square(String text) {
        if (text.length() != 2 || text.charAt(0) < 'a' || text.charAt(0) > 'h' || text.charAt(1) < '1' || text.charAt(1) > '8') return null;
        return new int[] {8 - (text.charAt(1) - '0'), text.charAt(0) - 'a'};
    }
    static boolean clear(int r1, int c1, int r2, int c2) {
        int dr = Integer.compare(r2, r1), dc = Integer.compare(c2, c1), r = r1 + dr, c = c1 + dc;
        while (r != r2 || c != c2) { if (board[r][c] != '.') return false; r += dr; c += dc; }
        return true;
    }
    static boolean legal(int r1, int c1, int r2, int c2) {
        char piece = board[r1][c1], target = board[r2][c2];
        if (piece == '.' || (target != '.' && white(piece) == white(target))) return false;
        int dr = r2 - r1, dc = c2 - c1;
        char kind = Character.toLowerCase(piece);
        if (kind == 'p') {
            int step = white(piece) ? -1 : 1, start = white(piece) ? 6 : 1;
            if (dc == 0 && target == '.' && (dr == step || (dr == 2 * step && r1 == start && board[r1 + step][c1] == '.'))) return true;
            return Math.abs(dc) == 1 && dr == step && target != '.';
        }
        if (kind == 'n') return Math.abs(dr) * Math.abs(dc) == 2 && Math.abs(dr) + Math.abs(dc) == 3;
        if (kind == 'k') return Math.max(Math.abs(dr), Math.abs(dc)) == 1;
        boolean straight = (dr == 0 || dc == 0) && (dr != 0 || dc != 0);
        boolean diagonal = Math.abs(dr) == Math.abs(dc) && dr != 0;
        if (kind == 'r') return straight && clear(r1, c1, r2, c2);
        if (kind == 'b') return diagonal && clear(r1, c1, r2, c2);
        if (kind == 'q') return (straight || diagonal) && clear(r1, c1, r2, c2);
        return false;
    }
    public static void main(String[] args) {
        java.util.Scanner in = new java.util.Scanner(System.in);
        boolean turn = true;
        while (true) {
            System.out.println("  a b c d e f g h");
            for (int r = 0; r < 8; r++) {
                System.out.print((8 - r) + " ");
                for (char cell : board[r]) System.out.print(cell + " ");
                System.out.println();
            }
            System.out.print("move: ");
            String line = in.nextLine().trim();
            if (line.equals("quit")) break;
            String[] parts = line.split(" ");
            if (parts.length != 2 || square(parts[0]) == null || square(parts[1]) == null) { System.out.println("use e2 e4"); continue; }
            int[] a = square(parts[0]), b = square(parts[1]);
            char piece = board[a[0]][a[1]];
            if (piece == '.' || turn != white(piece) || !legal(a[0], a[1], b[0], b[1])) { System.out.println("illegal"); continue; }
            board[b[0]][b[1]] = piece;
            board[a[0]][a[1]] = '.';
            turn = !turn;
        }
    }
}
`, `#include <stdio.h>
#include <string.h>
#include <ctype.h>

char board[8][8] = {
    {'r','n','b','q','k','b','n','r'}, {'p','p','p','p','p','p','p','p'},
    {'.','.','.','.','.','.','.','.'}, {'.','.','.','.','.','.','.','.'},
    {'.','.','.','.','.','.','.','.'}, {'.','.','.','.','.','.','.','.'},
    {'P','P','P','P','P','P','P','P'}, {'R','N','B','Q','K','B','N','R'}
};

int white(char p) { return p >= 'A' && p <= 'Z'; }

int square(const char *text, int *r, int *c) {
    if (strlen(text) != 2 || text[0] < 'a' || text[0] > 'h' || text[1] < '1' || text[1] > '8') return 0;
    *r = 8 - (text[1] - '0');
    *c = text[0] - 'a';
    return 1;
}

int clear(int r1, int c1, int r2, int c2) {
    int dr = (r2 > r1) - (r2 < r1), dc = (c2 > c1) - (c2 < c1);
    int r = r1 + dr, c = c1 + dc;
    while (r != r2 || c != c2) { if (board[r][c] != '.') return 0; r += dr; c += dc; }
    return 1;
}

int legal(int r1, int c1, int r2, int c2) {
    char piece = board[r1][c1], target = board[r2][c2], kind;
    int dr = r2 - r1, dc = c2 - c1, straight, diagonal, step, start;
    if (piece == '.' || (target != '.' && white(piece) == white(target))) return 0;
    kind = (char) tolower((unsigned char) piece);
    if (kind == 'p') {
        step = white(piece) ? -1 : 1;
        start = white(piece) ? 6 : 1;
        if (dc == 0 && target == '.' && (dr == step || (dr == 2 * step && r1 == start && board[r1 + step][c1] == '.'))) return 1;
        return (dc == 1 || dc == -1) && dr == step && target != '.';
    }
    if (kind == 'n') return (dr * dc == 2 || dr * dc == -2) && (dr * dr + dc * dc == 5);
    if (kind == 'k') return dr >= -1 && dr <= 1 && dc >= -1 && dc <= 1 && (dr || dc);
    straight = (dr == 0 || dc == 0) && (dr || dc);
    diagonal = (dr == dc || dr == -dc) && dr;
    if (kind == 'r') return straight && clear(r1, c1, r2, c2);
    if (kind == 'b') return diagonal && clear(r1, c1, r2, c2);
    if (kind == 'q') return (straight || diagonal) && clear(r1, c1, r2, c2);
    return 0;
}

int main() {
    int turn = 1, r, c, r1, c1, r2, c2;
    char line[32], from[8], to[8];
    while (1) {
        printf("  a b c d e f g h\\n");
        for (r = 0; r < 8; r++) {
            printf("%d ", 8 - r);
            for (c = 0; c < 8; c++) printf("%c ", board[r][c]);
            printf("\\n");
        }
        printf("move: ");
        if (!fgets(line, 32, stdin)) break;
        if (strncmp(line, "quit", 4) == 0) break;
        if (sscanf(line, "%7s %7s", from, to) != 2 || !square(from, &r1, &c1) || !square(to, &r2, &c2)) {
            printf("use e2 e4\\n");
            continue;
        }
        if (board[r1][c1] == '.' || turn != white(board[r1][c1]) || !legal(r1, c1, r2, c2)) {
            printf("illegal\\n");
            continue;
        }
        board[r2][c2] = board[r1][c1];
        board[r1][c1] = '.';
        turn = !turn;
    }
    return 0;
}
`);

add(7, U7, "big-o", "Algorithmic Analysis, Computational Complexity, and Big-O Notation", {
  say: "Big-O is how the work grows when the input grows. Count steps. Do not time the computer and call that a proof.",
  goal: "Count the steps of a linear scan and a nested scan, then say which is O(n) and which is O(n^2).",
  steps: [
    "Run both counters on n = 10 and n = 20. The linear count doubles. The nested count roughly quadruples.",
    "Write the names on the board: O(1), O(log n), O(n), O(n^2). Place binary search and bubble sort on that list.",
    "Ask them to predict the nested count for n = 30 before they run it.",
  ],
  watch: "They memorize the names and cannot point at the loop that causes them. The count variables are the lesson.",
  done: "They can classify a single loop, a loop that halves, and a nested loop without looking at a chart.",
}, `def linear(n):
    steps = 0
    for _ in range(n):
        steps += 1
    return steps

def nested(n):
    steps = 0
    for _ in range(n):
        for _j in range(n):
            steps += 1
    return steps

n = int(input("n: "))
print("O(n)", linear(n))
print("O(n^2)", nested(n))
`, J(`Scanner in = new Scanner(System.in);
System.out.print("n: ");
int n = Integer.parseInt(in.nextLine().trim());
System.out.println("O(n) " + linear(n));
System.out.println("O(n^2) " + nested(n));`, `static int linear(int n) {
    int steps = 0;
    for (int i = 0; i < n; i++) steps += 1;
    return steps;
}
static int nested(int n) {
    int steps = 0;
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) steps += 1;
    return steps;
}`), C(`int n;
printf("n: ");
scanf("%d", &n);
printf("O(n) %d\\n", linear(n));
printf("O(n^2) %d\\n", nested(n));`, `int linear(int n) {
    int i, steps = 0;
    for (i = 0; i < n; i++) steps += 1;
    return steps;
}
int nested(int n) {
    int i, j, steps = 0;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) steps += 1;
    return steps;
}`));

add(7, U7, "linked-list", "Linked List", {
  say: "A node points at the next node. There is no index. To reach the third item you walk from the head.",
  goal: "Insert at the front, append at the end, and print the list.",
  steps: [
    "Draw three boxes and arrows before any code. The last arrow is empty.",
    "Insert at the front first. It is one pointer change. Append second, because they must walk to the end.",
    "Print after each insert so a lost pointer shows up immediately.",
  ],
  watch: "They update head before they have saved the old head, and the rest of the list is gone. Also a loop that never follows next.",
  done: "Front insert, append, and print match the drawing, and they can say why there is no nums[2].",
}, `class Node:
    def __init__(self, value, nxt=None):
        self.value = value
        self.next = nxt

class List:
    def __init__(self):
        self.head = None
    def insert_front(self, value):
        self.head = Node(value, self.head)
    def append(self, value):
        if not self.head:
            self.head = Node(value)
            return
        cur = self.head
        while cur.next:
            cur = cur.next
        cur.next = Node(value)
    def show(self):
        cur = self.head
        while cur:
            print(cur.value, end=" ")
            cur = cur.next
        print()

items = List()
items.insert_front(2)
items.insert_front(1)
items.append(3)
items.show()
`, `class Node {
    int value;
    Node next;
    Node(int value, Node next) { this.value = value; this.next = next; }
}
class List {
    Node head;
    void insertFront(int value) { head = new Node(value, head); }
    void append(int value) {
        if (head == null) { head = new Node(value, null); return; }
        Node cur = head;
        while (cur.next != null) cur = cur.next;
        cur.next = new Node(value, null);
    }
    void show() {
        for (Node cur = head; cur != null; cur = cur.next) System.out.print(cur.value + " ");
        System.out.println();
    }
}
public class Guide {
    public static void main(String[] args) {
        List items = new List();
        items.insertFront(2);
        items.insertFront(1);
        items.append(3);
        items.show();
    }
}
`, `#include <stdio.h>
#include <stdlib.h>

typedef struct Node { int value; struct Node *next; } Node;

Node *insert_front(Node *head, int value) {
    Node *node = malloc(sizeof *node);
    node->value = value;
    node->next = head;
    return node;
}

Node *append(Node *head, int value) {
    Node *node = malloc(sizeof *node), *cur = head;
    node->value = value;
    node->next = NULL;
    if (!head) return node;
    while (cur->next) cur = cur->next;
    cur->next = node;
    return head;
}

void show(Node *head) {
    while (head) { printf("%d ", head->value); head = head->next; }
    printf("\\n");
}

int main() {
    Node *head = NULL;
    head = insert_front(head, 2);
    head = insert_front(head, 1);
    head = append(head, 3);
    show(head);
    return 0;
}
`);

add(7, U7, "stack", "Stack", {
  say: "A stack is last in, first out. Push puts a plate on top. Pop takes the top plate. You do not pull from the middle.",
  goal: "Implement push and pop, then use the stack to check whether brackets match.",
  steps: [
    "Push three values and pop them. The order must reverse. If it does not, it is not a stack.",
    "Then the bracket checker: an open bracket pushes, a close bracket pops and must match.",
    "Test ()[], (], and an empty string.",
  ],
  watch: "Pop on an empty stack. The bracket checker must fail closed, not crash. Also a queue used by accident.",
  done: "()[] is balanced, (] is not, and they can show the stack after each character of ([)].",
}, `def balanced(text):
    stack = []
    pairs = {")": "(", "]": "[", "}": "{"}
    for ch in text:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack

for sample in ["()[]", "(]", "([)]", ""]:
    print(sample, balanced(sample))
`, J(`System.out.println(balanced("()[]"));
System.out.println(balanced("(]"));
System.out.println(balanced("([)]"));
System.out.println(balanced(""));`, `static boolean balanced(String text) {
    ArrayDeque<Character> stack = new ArrayDeque<>();
    for (int i = 0; i < text.length(); i++) {
        char ch = text.charAt(i);
        if (ch == '(' || ch == '[' || ch == '{') stack.push(ch);
        else if (ch == ')' || ch == ']' || ch == '}') {
            if (stack.isEmpty()) return false;
            char open = stack.pop();
            if ((ch == ')' && open != '(') || (ch == ']' && open != '[') || (ch == '}' && open != '{')) return false;
        }
    }
    return stack.isEmpty();
}`), C(`printf("%d\\n", balanced("()[]"));
printf("%d\\n", balanced("(]"));
printf("%d\\n", balanced("([)]"));
printf("%d\\n", balanced(""));`, `int balanced(const char *text) {
    char stack[64];
    int top = 0, i;
    for (i = 0; text[i]; i++) {
        char ch = text[i];
        if (ch == '(' || ch == '[' || ch == '{') stack[top++] = ch;
        else if (ch == ')' || ch == ']' || ch == '}') {
            char open;
            if (!top) return 0;
            open = stack[--top];
            if ((ch == ')' && open != '(') || (ch == ']' && open != '[') || (ch == '}' && open != '{')) return 0;
        }
    }
    return top == 0;
}`, ["stdio.h"]));

add(7, U7, "queue", "Queue", {
  say: "A queue is first in, first out. Enqueue at the back. Dequeue from the front. The front does not move by magic if you only append.",
  goal: "Enqueue three names, dequeue them in the same order, then say how a queue differs from the stack.",
  steps: [
    "Act it out with three people in a line before the code.",
    "A Python list can be the teaching queue if they pop from the front and they can say that is slow. A Java ArrayDeque or a C ring buffer is better.",
    "Print the front after each dequeue. The second person should be the new front.",
  ],
  watch: "They pop from the end and have built a stack. Also a C ring buffer whose front and back start equal and cannot tell empty from full. Keep a count.",
  done: "The names come out in the order they went in, and they can contrast that with yesterday's stack.",
}, `from collections import deque
line = deque()
for name in ("Ada", "Lin", "Max"):
    line.append(name)
while line:
    print(line.popleft())
`, J(`Queue<String> line = new ArrayDeque<>();
line.add("Ada");
line.add("Lin");
line.add("Max");
while (!line.isEmpty()) System.out.println(line.remove());`), C(`char *line[8];
int front = 0, back = 0, count = 0, i;
char *names[] = {"Ada", "Lin", "Max"};
for (i = 0; i < 3; i++) { line[back] = names[i]; back = (back + 1) % 8; count++; }
while (count) { printf("%s\\n", line[front]); front = (front + 1) % 8; count--; }`, "", ["stdio.h"]));

add(7, U7, "bst", "Binary Search Tree", {
  say: "A binary search tree node has a left and a right. Smaller values go left. Larger values go right. Equal values need a rule. Today, reject the duplicate.",
  goal: "Insert several numbers and print them in order by walking left, node, right.",
  steps: [
    "Insert 5, 2, 8, 1 on the board. Then write the same inserts.",
    "In-order print should be sorted. If it is not, the insert went to the wrong side.",
    "Search for 8 and for 7. Found and not found are both required.",
  ],
  watch: "They replace the node instead of walking to an empty child. Also an in-order print that visits right before left.",
  done: "The print is sorted, search finds 8, and search reports 7 missing.",
}, `class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None

def insert(node, value):
    if not node:
        return Node(value)
    if value < node.value:
        node.left = insert(node.left, value)
    elif value > node.value:
        node.right = insert(node.right, value)
    return node

def search(node, value):
    if not node:
        return False
    if value == node.value:
        return True
    if value < node.value:
        return search(node.left, value)
    return search(node.right, value)

def show(node):
    if not node:
        return
    show(node.left)
    print(node.value, end=" ")
    show(node.right)

root = None
for value in (5, 2, 8, 1):
    root = insert(root, value)
show(root)
print()
print("8", search(root, 8))
print("7", search(root, 7))
`, `class Node {
    int value; Node left, right;
    Node(int value) { this.value = value; }
}
public class Guide {
    static Node insert(Node node, int value) {
        if (node == null) return new Node(value);
        if (value < node.value) node.left = insert(node.left, value);
        else if (value > node.value) node.right = insert(node.right, value);
        return node;
    }
    static boolean search(Node node, int value) {
        if (node == null) return false;
        if (value == node.value) return true;
        return value < node.value ? search(node.left, value) : search(node.right, value);
    }
    static void show(Node node) {
        if (node == null) return;
        show(node.left);
        System.out.print(node.value + " ");
        show(node.right);
    }
    public static void main(String[] args) {
        Node root = null;
        for (int value : new int[]{5, 2, 8, 1}) root = insert(root, value);
        show(root);
        System.out.println();
        System.out.println("8 " + search(root, 8));
        System.out.println("7 " + search(root, 7));
    }
}
`, `#include <stdio.h>
#include <stdlib.h>

typedef struct Node { int value; struct Node *left, *right; } Node;

Node *insert(Node *node, int value) {
    if (!node) {
        node = malloc(sizeof *node);
        node->value = value;
        node->left = node->right = NULL;
        return node;
    }
    if (value < node->value) node->left = insert(node->left, value);
    else if (value > node->value) node->right = insert(node->right, value);
    return node;
}

int search(Node *node, int value) {
    if (!node) return 0;
    if (value == node->value) return 1;
    return value < node->value ? search(node->left, value) : search(node->right, value);
}

void show(Node *node) {
    if (!node) return;
    show(node->left);
    printf("%d ", node->value);
    show(node->right);
}

int main() {
    Node *root = NULL;
    int values[] = {5, 2, 8, 1}, i;
    for (i = 0; i < 4; i++) root = insert(root, values[i]);
    show(root);
    printf("\\n8 %d\\n7 %d\\n", search(root, 8), search(root, 7));
    return 0;
}
`);

add(7, U7, "avl", "AVL Tree", {
  say: "An AVL tree is a binary search tree that rotates when one side gets more than one level taller than the other. The balance factor is left height minus right height.",
  goal: "Insert with heights, and perform a right rotation when the left side is too tall. Show the tree before and after the rotation.",
  steps: [
    "Insert 3, then 2, then 1 into a plain BST on the board. It is a line. That is the case this code repairs.",
    "A right rotation makes 2 the root, 1 its left, 3 its right. Act that out with cards before they read the pointers.",
    "The left-right case is two rotations. Show it only after the single rotation is solid. The reference includes both.",
  ],
  watch: "They update the child pointer and forget to return the new subtree root, so the parent still points at the old node. Also heights left at 0.",
  done: "Inserting 3, 2, 1 ends with 2 at the root, and they can name the rotation.",
}, `class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None
        self.height = 1

def height(node):
    return node.height if node else 0

def refresh(node):
    node.height = 1 + max(height(node.left), height(node.right))
    return node

def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    refresh(y)
    return refresh(x)

def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    refresh(x)
    return refresh(y)

def balance(node):
    factor = height(node.left) - height(node.right)
    if factor > 1 and height(node.left.left) >= height(node.left.right):
        return rotate_right(node)
    if factor > 1:
        node.left = rotate_left(node.left)
        return rotate_right(node)
    if factor < -1 and height(node.right.right) >= height(node.right.left):
        return rotate_left(node)
    if factor < -1:
        node.right = rotate_right(node.right)
        return rotate_left(node)
    return node

def insert(node, value):
    if not node:
        return Node(value)
    if value < node.value:
        node.left = insert(node.left, value)
    elif value > node.value:
        node.right = insert(node.right, value)
    else:
        return node
    refresh(node)
    return balance(node)

def show(node, indent=""):
    if not node:
        return
    show(node.right, indent + "  ")
    print(indent + str(node.value))
    show(node.left, indent + "  ")

root = None
for value in (3, 2, 1, 4, 5):
    root = insert(root, value)
show(root)
print("root", root.value)
`, `class Node {
    int value, height = 1;
    Node left, right;
    Node(int value) { this.value = value; }
}
public class Guide {
    static int height(Node node) { return node == null ? 0 : node.height; }
    static Node refresh(Node node) {
        node.height = 1 + Math.max(height(node.left), height(node.right));
        return node;
    }
    static Node rotateRight(Node y) {
        Node x = y.left;
        y.left = x.right;
        x.right = y;
        refresh(y);
        return refresh(x);
    }
    static Node rotateLeft(Node x) {
        Node y = x.right;
        x.right = y.left;
        y.left = x;
        refresh(x);
        return refresh(y);
    }
    static Node balance(Node node) {
        int factor = height(node.left) - height(node.right);
        if (factor > 1 && height(node.left.left) >= height(node.left.right)) return rotateRight(node);
        if (factor > 1) { node.left = rotateLeft(node.left); return rotateRight(node); }
        if (factor < -1 && height(node.right.right) >= height(node.right.left)) return rotateLeft(node);
        if (factor < -1) { node.right = rotateRight(node.right); return rotateLeft(node); }
        return node;
    }
    static Node insert(Node node, int value) {
        if (node == null) return new Node(value);
        if (value < node.value) node.left = insert(node.left, value);
        else if (value > node.value) node.right = insert(node.right, value);
        else return node;
        refresh(node);
        return balance(node);
    }
    public static void main(String[] args) {
        Node root = null;
        for (int value : new int[]{3, 2, 1, 4, 5}) root = insert(root, value);
        System.out.println("root " + root.value);
    }
}
`, `#include <stdio.h>
#include <stdlib.h>

typedef struct Node { int value, height; struct Node *left, *right; } Node;

int height(Node *node) { return node ? node->height : 0; }
int max(int a, int b) { return a > b ? a : b; }

Node *make(int value) {
    Node *node = malloc(sizeof *node);
    node->value = value;
    node->height = 1;
    node->left = node->right = NULL;
    return node;
}

Node *refresh(Node *node) {
    node->height = 1 + max(height(node->left), height(node->right));
    return node;
}

Node *rotate_right(Node *y) {
    Node *x = y->left;
    y->left = x->right;
    x->right = y;
    refresh(y);
    return refresh(x);
}

Node *rotate_left(Node *x) {
    Node *y = x->right;
    x->right = y->left;
    y->left = x;
    refresh(x);
    return refresh(y);
}

Node *balance(Node *node) {
    int factor = height(node->left) - height(node->right);
    if (factor > 1 && height(node->left->left) >= height(node->left->right)) return rotate_right(node);
    if (factor > 1) { node->left = rotate_left(node->left); return rotate_right(node); }
    if (factor < -1 && height(node->right->right) >= height(node->right->left)) return rotate_left(node);
    if (factor < -1) { node->right = rotate_right(node->right); return rotate_left(node); }
    return node;
}

Node *insert(Node *node, int value) {
    if (!node) return make(value);
    if (value < node->value) node->left = insert(node->left, value);
    else if (value > node->value) node->right = insert(node->right, value);
    else return node;
    refresh(node);
    return balance(node);
}

int main() {
    Node *root = NULL;
    int values[] = {3, 2, 1, 4, 5}, i;
    for (i = 0; i < 5; i++) root = insert(root, values[i]);
    printf("root %d\\n", root->value);
    return 0;
}
`);

add(8, U8, "graphs", "Graphs", {
  say: "A graph is nodes plus edges. An adjacency list says, for each node, who its neighbors are. That is the structure the later searches walk.",
  goal: "Build a small undirected graph and print every neighbor list.",
  steps: [
    "Draw five towns and the roads before any list. Undirected means each road is stored twice, once from each end.",
    "Have them add one road in the code and show both neighbor lists changed.",
    "Ask what a missing reverse edge would mean. It would be a one-way road. Today there are none.",
  ],
  watch: "A grid of zeros they never learned to read, or a list that stores the edge only one way and then surprises them in BFS.",
  done: "The printed neighbor lists match the drawing, including the road they added.",
}, `graph = {0: [1, 2], 1: [0, 3], 2: [0, 3], 3: [1, 2, 4], 4: [3]}
for node, neighbors in graph.items():
    print(node, neighbors)
`, J(`int[][] graph = {{1, 2}, {0, 3}, {0, 3}, {1, 2, 4}, {3}};
for (int node = 0; node < graph.length; node++) {
    System.out.print(node);
    for (int next : graph[node]) System.out.print(" " + next);
    System.out.println();
}`), C(`int graph[5][3] = {{1, 2, -1}, {0, 3, -1}, {0, 3, -1}, {1, 2, 4}, {3, -1, -1}};
int node, i;
for (node = 0; node < 5; node++) {
    printf("%d", node);
    for (i = 0; i < 3 && graph[node][i] >= 0; i++) printf(" %d", graph[node][i]);
    printf("\\n");
}`));

add(8, U8, "pathfinding", "Pathfinding", {
  say: "Pathfinding is a search plus a way to remember how you got there. Visiting a node is not the same as knowing the path.",
  goal: "On the town graph, record the parent of each visited node and rebuild the path from the end back to the start.",
  steps: [
    "Use the graph from the last module. Search from 0 to 4 by hand and write the parent of each town.",
    "The code may use a simple queue. The new part is the parent array.",
    "Rebuild the path from 4 back to 0, then reverse it before you print.",
  ],
  watch: "They print the visit order and call it the path. Visit order is not the path if there are branches.",
  done: "The printed path starts at 0, ends at 4, and every step is an edge on the drawing.",
}, `from collections import deque
graph = {0: [1, 2], 1: [0, 3], 2: [0, 3], 3: [1, 2, 4], 4: [3]}
start, goal = 0, 4
parent = {start: None}
queue = deque([start])
while queue:
    node = queue.popleft()
    if node == goal:
        break
    for nxt in graph[node]:
        if nxt not in parent:
            parent[nxt] = node
            queue.append(nxt)
path = []
cur = goal
while cur is not None:
    path.append(cur)
    cur = parent.get(cur)
print(list(reversed(path)))
`, J(`int[][] graph = {{1, 2}, {0, 3}, {0, 3}, {1, 2, 4}, {3}};
int[] parent = {-2, -2, -2, -2, -2};
ArrayDeque<Integer> queue = new ArrayDeque<>();
parent[0] = -1;
queue.add(0);
while (!queue.isEmpty()) {
    int node = queue.remove();
    if (node == 4) break;
    for (int next : graph[node]) if (parent[next] == -2) {
        parent[next] = node;
        queue.add(next);
    }
}
int[] path = new int[5];
int n = 0, cur = 4;
while (cur >= 0) { path[n++] = cur; cur = parent[cur]; }
for (int i = n - 1; i >= 0; i--) System.out.print(path[i] + " ");
System.out.println();`), C(`int graph[5][3] = {{1, 2, -1}, {0, 3, -1}, {0, 3, -1}, {1, 2, 4}, {3, -1, -1}};
int parent[5] = {-2, -2, -2, -2, -2};
int queue[5], qh = 0, qt = 0, node, i, cur, path[5], n = 0;
parent[0] = -1;
queue[qt++] = 0;
while (qh < qt) {
    node = queue[qh++];
    if (node == 4) break;
    for (i = 0; i < 3 && graph[node][i] >= 0; i++) if (parent[graph[node][i]] == -2) {
        parent[graph[node][i]] = node;
        queue[qt++] = graph[node][i];
    }
}
cur = 4;
while (cur >= 0) { path[n++] = cur; cur = parent[cur]; }
for (i = n - 1; i >= 0; i--) printf("%d ", path[i]);
printf("\\n");`));

add(8, U8, "bfs-dfs", "Pathfinding with BFS & DFS", {
  say: "BFS uses a queue and finds a shortest path in an unweighted graph. DFS uses a stack or recursion and finds a path, not necessarily the shortest.",
  goal: "Run both searches from the same start and goal and compare the paths.",
  steps: [
    "Draw a graph where the shortest path is not the first deep branch. Otherwise DFS and BFS look the same and the lesson disappears.",
    "BFS first, because the queue is familiar. Then DFS with an explicit stack so they can see it is the stack module again.",
    "Ask which one they would use for a maze if every step costs the same. BFS.",
  ],
  watch: "They mark a node visited when they pop it, so the same node enters the queue many times. Mark it when you first discover it.",
  done: "BFS returns the shorter path, DFS returns a valid path, and they can say why those answers differ.",
}, `graph = {0: [1, 2], 1: [0, 3, 4], 2: [0], 3: [1], 4: [1]}

def bfs(start, goal):
    parent = {start: None}
    queue = [start]
    while queue:
        node = queue.pop(0)
        if node == goal:
            break
        for nxt in graph[node]:
            if nxt not in parent:
                parent[nxt] = node
                queue.append(nxt)
    return rebuild(parent, goal)

def dfs(start, goal):
    parent = {start: None}
    stack = [start]
    while stack:
        node = stack.pop()
        if node == goal:
            break
        for nxt in graph[node]:
            if nxt not in parent:
                parent[nxt] = node
                stack.append(nxt)
    return rebuild(parent, goal)

def rebuild(parent, goal):
    path = []
    cur = goal
    while cur is not None:
        path.append(cur)
        cur = parent.get(cur)
    return list(reversed(path))

print("bfs", bfs(0, 4))
print("dfs", dfs(0, 4))
`, J(`int[][] graph = {{1, 2}, {0, 3, 4}, {0}, {1}, {1}};
System.out.print("bfs ");
search(graph, true);
System.out.print("dfs ");
search(graph, false);`, `static void search(int[][] graph, boolean breadth) {
    int[] parent = {-2, -2, -2, -2, -2};
    ArrayDeque<Integer> pending = new ArrayDeque<>();
    parent[0] = -1;
    pending.add(0);
    while (!pending.isEmpty()) {
        int node = breadth ? pending.removeFirst() : pending.removeLast();
        if (node == 4) break;
        for (int next : graph[node]) if (parent[next] == -2) {
            parent[next] = node;
            pending.addLast(next);
        }
    }
    int[] path = new int[5];
    int n = 0, cur = 4;
    while (cur >= 0) { path[n++] = cur; cur = parent[cur]; }
    for (int i = n - 1; i >= 0; i--) System.out.print(path[i] + " ");
    System.out.println();
}`), C(`int bfs_graph[5][3] = {{1, 2, -1}, {0, 3, 4}, {0, -1, -1}, {1, -1, -1}, {1, -1, -1}};
printf("bfs ");
search(1);
printf("dfs ");
search(0);`, `void search(int breadth) {
    int graph[5][3] = {{1, 2, -1}, {0, 3, 4}, {0, -1, -1}, {1, -1, -1}, {1, -1, -1}};
    int parent[5] = {-2, -2, -2, -2, -2};
    int pending[8], head = 0, tail = 0, node, i, cur, path[5], n = 0;
    parent[0] = -1;
    pending[tail++] = 0;
    while (head < tail) {
        if (breadth) node = pending[head++];
        else node = pending[--tail];
        if (node == 4) break;
        for (i = 0; i < 3 && graph[node][i] >= 0; i++) if (parent[graph[node][i]] == -2) {
            parent[graph[node][i]] = node;
            pending[tail++] = graph[node][i];
        }
    }
    cur = 4;
    while (cur >= 0) { path[n++] = cur; cur = parent[cur]; }
    for (i = n - 1; i >= 0; i--) printf("%d ", path[i]);
    printf("\\n");
}`));

add(8, U8, "dijkstra", "Pathfinding with Dijkstra's Algorithm", {
  say: "When edges have weights, BFS is no longer enough. Dijkstra always expands the cheapest unfinished node.",
  goal: "Find the cheapest path on a weighted graph and print the cost as well as the nodes.",
  steps: [
    "Put weights on the drawing. Include a longer route with more nodes but a cheaper total, or the algorithm looks like BFS.",
    "A distance array starts at infinity, except the start, which is 0.",
    "When you relax an edge, update the parent too, or you will know the cost and not the path.",
  ],
  watch: "They expand a node more than once after it is finished, or they use a queue instead of picking the smallest distance.",
  done: "The printed cost matches the paper sum, and a cheaper long route beats a short expensive one.",
}, `import heapq
graph = {0: [(1, 4), (2, 1)], 1: [(3, 1)], 2: [(1, 2), (3, 5)], 3: []}
start, goal = 0, 3
dist = {node: float("inf") for node in graph}
dist[start] = 0
parent = {start: None}
heap = [(0, start)]
while heap:
    cost, node = heapq.heappop(heap)
    if cost != dist[node]:
        continue
    if node == goal:
        break
    for nxt, weight in graph[node]:
        cand = cost + weight
        if cand < dist[nxt]:
            dist[nxt] = cand
            parent[nxt] = node
            heapq.heappush(heap, (cand, nxt))
path = []
cur = goal
while cur is not None:
    path.append(cur)
    cur = parent.get(cur)
print(list(reversed(path)), dist[goal])
`, J(`int[][][] graph = {{{1, 4}, {2, 1}}, {{3, 1}}, {{1, 2}, {3, 5}}, {}};
int[] dist = {0, 999, 999, 999};
int[] parent = {-1, -2, -2, -2};
boolean[] done = new boolean[4];
while (true) {
    int node = -1;
    for (int i = 0; i < 4; i++) if (!done[i] && (node < 0 || dist[i] < dist[node])) node = i;
    if (node < 0 || node == 3) break;
    done[node] = true;
    for (int[] edge : graph[node]) {
        int cand = dist[node] + edge[1];
        if (cand < dist[edge[0]]) { dist[edge[0]] = cand; parent[edge[0]] = node; }
    }
}
System.out.println("cost " + dist[3]);`), C(`int from[] = {0, 0, 1, 2, 2};
int to[] = {1, 2, 3, 1, 3};
int weight[] = {4, 1, 1, 2, 5};
int dist[4] = {0, 999, 999, 999};
int parent[4] = {-1, -2, -2, -2};
int done[4] = {0}, node, i, best, cand;
while (1) {
    node = -1;
    for (i = 0; i < 4; i++) if (!done[i] && (node < 0 || dist[i] < dist[node])) node = i;
    if (node < 0 || node == 3) break;
    done[node] = 1;
    for (i = 0; i < 5; i++) if (from[i] == node) {
        cand = dist[node] + weight[i];
        if (cand < dist[to[i]]) { dist[to[i]] = cand; parent[to[i]] = node; }
    }
}
printf("cost %d\\n", dist[3]);`));

add(8, U8, "astar", "Pathfinding with A*", {
  say: "A* is Dijkstra plus a guess of the remaining distance. The guess must never be bigger than the truth, or A* can miss the best path.",
  goal: "Find a path on a small grid using f = g + h, where h is the Manhattan distance to the goal.",
  steps: [
    "Manhattan distance is abs(row difference) plus abs(column difference). No diagonals today, so that guess is safe.",
    "g is the steps so far. f is what you sort by. Have them compute f for two frontier cells on paper.",
    "Compare the expanded cells with Dijkstra on the same grid. A* should expand fewer if the guess is useful.",
  ],
  watch: "They sort by h only and ignore the cost so far. That is greedy, not A*. Also a heuristic that includes diagonals while the moves do not.",
  done: "The path reaches the goal, its length matches a hand count, and they can point at g, h, and f.",
}, `import heapq
start, goal = (0, 0), (2, 2)
blocked = {(1, 1)}

def h(node):
    return abs(node[0] - goal[0]) + abs(node[1] - goal[1])

def astar():
    g = {start: 0}
    parent = {start: None}
    heap = [(h(start), start)]
    while heap:
        _f, node = heapq.heappop(heap)
        if node == goal:
            break
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nxt = (node[0] + dr, node[1] + dc)
            if not (0 <= nxt[0] < 3 and 0 <= nxt[1] < 3) or nxt in blocked:
                continue
            cand = g[node] + 1
            if cand < g.get(nxt, 999):
                g[nxt] = cand
                parent[nxt] = node
                heapq.heappush(heap, (cand + h(nxt), nxt))
    path = []
    cur = goal
    while cur is not None:
        path.append(cur)
        cur = parent.get(cur)
    return list(reversed(path)), g.get(goal)

print(astar())
`, J(`int[] goal = {2, 2};
int[][] blocked = {{1, 1}};
System.out.println("goal g " + search());`, `static int h(int r, int c) { return Math.abs(r - 2) + Math.abs(c - 2); }
static int search() {
    int[][] g = new int[3][3];
    for (int[] row : g) java.util.Arrays.fill(row, 999);
    boolean[][] seen = new boolean[3][3];
    g[0][0] = 0;
    while (true) {
        int r = -1, c = -1, best = 9999;
        for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) {
            int f = g[i][j] + h(i, j);
            if (!seen[i][j] && g[i][j] < 999 && f < best) { best = f; r = i; c = j; }
        }
        if (r < 0) return -1;
        if (r == 2 && c == 2) return g[r][c];
        seen[r][c] = true;
        int[][] steps = {{1,0},{-1,0},{0,1},{0,-1}};
        for (int[] step : steps) {
            int rr = r + step[0], cc = c + step[1];
            if (rr < 0 || cc < 0 || rr > 2 || cc > 2 || (rr == 1 && cc == 1)) continue;
            if (g[r][c] + 1 < g[rr][cc]) g[rr][cc] = g[r][c] + 1;
        }
    }
}`), C(`printf("goal g %d\\n", search());`, `int h(int r, int c) { return abs(r - 2) + abs(c - 2); }
int search(void) {
    int g[3][3], seen[3][3] = {0}, i, j, r, c, best, rr, cc;
    int steps[4][2] = {{1,0},{-1,0},{0,1},{0,-1}}, s;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) g[i][j] = 999;
    g[0][0] = 0;
    while (1) {
        r = c = -1; best = 9999;
        for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
            int f = g[i][j] + h(i, j);
            if (!seen[i][j] && g[i][j] < 999 && f < best) { best = f; r = i; c = j; }
        }
        if (r < 0) return -1;
        if (r == 2 && c == 2) return g[r][c];
        seen[r][c] = 1;
        for (s = 0; s < 4; s++) {
            rr = r + steps[s][0]; cc = c + steps[s][1];
            if (rr < 0 || cc < 0 || rr > 2 || cc > 2 || (rr == 1 && cc == 1)) continue;
            if (g[r][c] + 1 < g[rr][cc]) g[rr][cc] = g[r][c] + 1;
        }
    }
}`, ["stdio.h", "stdlib.h"]));


add(9, U9, "files-101-java", "Files 101 (Java)", {
  say: "A file is a named place outside the program. Java writes with a Path and reads the same Path back. This Java sample is a lab reference: the browser runner cannot open the real disk.",
  goal: "Write one line to hello.txt, read it back, and print it.",
  steps: [
    "Say the file name out loud before the write. The read must use that same name.",
    "Run this in a lab with a real JDK, not the browser Play button. The browser has no disk.",
    "Change the line, run again, and show that the old text was replaced, not appended.",
  ],
  watch: "They read a different file name than they wrote. Also they expect Play in the IDE to create a file on their computer. It will not.",
  done: "In the lab, the printed line matches the file, and they can point at the Path that both calls share.",
}, `# Lab reference for the Java lesson. open() here is Pyodide's in-memory file.
# It is not saved to GitHub when the project closes.
with open("hello.txt", "w") as handle:
    handle.write("Hello from a file\\n")
with open("hello.txt") as handle:
    print(handle.read(), end="")
`, J(`try {
    java.nio.file.Files.writeString(java.nio.file.Path.of("hello.txt"), "Hello from a file\\n");
    System.out.println(java.nio.file.Files.readString(java.nio.file.Path.of("hello.txt")));
} catch (Exception ex) {
    System.out.println("lab only: " + ex);
}`), C(`FILE *handle = fopen("hello.txt", "w");
if (!handle) { printf("cannot open\\n"); return 1; }
fprintf(handle, "Hello from a file\\n");
fclose(handle);
handle = fopen("hello.txt", "r");
if (handle) {
    char buf[80];
    if (fgets(buf, 80, handle)) printf("%s", buf);
    fclose(handle);
}`, "", ["stdio.h"]), "java");

add(9, U9, "files-101-python", "Files 101 (Python)", {
  say: "Python open() writes a named file and can read it back. In this IDE, open() uses an in-memory filesystem. It works for the lesson, and it does not commit to GitHub by itself.",
  goal: "Write a name to notes.txt and print the file back.",
  steps: [
    "Write the file with a with block so it closes even if they forget.",
    "Read it in a second with block. Print the text, then print the file name so they see those are different.",
    "Tell them closing the project does not upload this file. GitHub only gets files they saved in the editor.",
  ],
  watch: "They use the same variable for the name and the text. Also they think the terminal file is now on GitHub.",
  done: "The printed file matches what they wrote, and they can say it lives only for this run unless they also save it as a project file.",
}, `name = input("Name: ")
with open("notes.txt", "w") as handle:
    handle.write(name + "\\n")
with open("notes.txt") as handle:
    print(handle.read(), end="")
print("saved in memory, not on GitHub")
`, J(`try {
    java.nio.file.Files.writeString(java.nio.file.Path.of("notes.txt"), "Ada\\n");
    System.out.println(java.nio.file.Files.readString(java.nio.file.Path.of("notes.txt")));
    System.out.println("lab reference: the browser cannot open the real disk");
} catch (Exception ex) {
    System.out.println("lab only: " + ex);
}`), C(`FILE *handle = fopen("notes.txt", "w");
if (!handle) { printf("cannot open\\n"); return 1; }
fprintf(handle, "Ada\\n");
fclose(handle);
handle = fopen("notes.txt", "r");
if (handle) {
    char buf[80];
    if (fgets(buf, 80, handle)) printf("%s", buf);
    fclose(handle);
}
printf("lab reference: the browser cannot open the real disk\\n");`, "", ["stdio.h"]), "python");

add(9, U9, "journal", "Journal", {
  say: "A journal appends. It does not erase yesterday. In Python, mode a adds a line. Java and C file samples are lab references; the browser cannot open the real disk. Python open() here is in-memory and is not committed to GitHub.",
  goal: "Append two journal lines and print the whole file so both lines are still there.",
  steps: [
    "Write once with mode w, then switch to mode a and write a second line.",
    "Read the whole file. If the first line vanished, they used w the second time.",
    "Have them add the date as text they type. Do not hide it inside a library.",
  ],
  watch: "Mode w on the second write. Also a missing newline so both days sit on one line.",
  done: "The printout shows both lines, in order, and they can say which mode would have deleted the first.",
}, `def add_line(text):
    with open("journal.txt", "a") as handle:
        handle.write(text + "\\n")

add_line("Monday: learned files")
add_line("Tuesday: appended, did not erase")
with open("journal.txt") as handle:
    print(handle.read(), end="")
`, J(`try {
    java.nio.file.Files.writeString(java.nio.file.Path.of("journal.txt"), "Monday: learned files\\n",
        java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
    java.nio.file.Files.writeString(java.nio.file.Path.of("journal.txt"), "Tuesday: appended, did not erase\\n",
        java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
    System.out.println(java.nio.file.Files.readString(java.nio.file.Path.of("journal.txt")));
} catch (Exception ex) {
    System.out.println("lab only: " + ex);
}`), C(`FILE *handle = fopen("journal.txt", "a");
if (!handle) { printf("cannot open\\n"); return 1; }
fprintf(handle, "Monday: learned files\\n");
fprintf(handle, "Tuesday: appended, did not erase\\n");
fclose(handle);
handle = fopen("journal.txt", "r");
if (handle) {
    char buf[80];
    while (fgets(buf, 80, handle)) printf("%s", buf);
    fclose(handle);
}`, "", ["stdio.h"]));

add(9, U9, "random-image", "Random Image", {
  say: "A picture can be a text file. PPM starts with P3, then width and height, then 255, then red green blue numbers. No image library is required.",
  goal: "Print a tiny random PPM and count that there are width times height pixels.",
  steps: [
    "Write P3, 4 2, and 255 by hand before the loop so the header is not a mystery.",
    "Each pixel is three numbers. Have them count the numbers on one row: it should be 12 for width 4.",
    "Change one pixel to 255 0 0 and find that red pixel in the output.",
  ],
  watch: "They print one number per pixel, or they forget the 255 line. Also a row whose length is not width times 3.",
  done: "The header is right, every row has width times 3 numbers, and they can point at the pixel they forced to red.",
}, `import random
width, height = 4, 2
print("P3")
print(width, height)
print(255)
for r in range(height):
    nums = []
    for c in range(width):
        if r == 0 and c == 0:
            nums.extend([255, 0, 0])
        else:
            nums.extend([random.randrange(256) for _ in range(3)])
    print(*nums)
`, J(`int width = 4, height = 2;
System.out.println("P3");
System.out.println(width + " " + height);
System.out.println(255);
for (int r = 0; r < height; r++) {
    for (int c = 0; c < width; c++) {
        if (r == 0 && c == 0) System.out.print("255 0 0 ");
        else System.out.print((r * 40) + " " + (c * 40) + " 80 ");
    }
    System.out.println();
}`), C(`int width = 4, height = 2, r, c;
printf("P3\\n%d %d\\n255\\n", width, height);
for (r = 0; r < height; r++) {
    for (c = 0; c < width; c++) {
        if (r == 0 && c == 0) printf("255 0 0 ");
        else printf("%d %d 80 ", r * 40, c * 40);
    }
    printf("\\n");
}`, "", ["stdio.h"]));

add(9, U9, "image-filters", "Image Filters", {
  say: "A filter visits every pixel and writes a new one. Grayscale uses one brightness for red, green, and blue. Invert is 255 minus each channel. The picture is still just numbers.",
  goal: "Turn a 2 by 2 color image into grayscale and also show the inverted first pixel.",
  steps: [
    "Write the four pixels on paper as triples. Do the first grayscale by hand: add, divide by 3.",
    "The new image needs its own array. Writing over the old one too early loses a channel you still need.",
    "Print both PPMs. The grayscale pixel should have three equal numbers.",
  ],
  watch: "Integer division surprises them when they expected a fraction. That is fine if they can say the three channels match. Also inverting after grayscale and not knowing which filter they are looking at.",
  done: "Grayscale pixels have equal channels, the inverted pixel matches 255 minus the original, and the source array is unchanged.",
}, `pixels = [[(255, 0, 0), (0, 255, 0)], [(0, 0, 255), (255, 255, 0)]]

def gray(pixel):
    tone = sum(pixel) // 3
    return (tone, tone, tone)

def invert(pixel):
    return tuple(255 - channel for channel in pixel)

print("gray", [gray(pixel) for row in pixels for pixel in row])
print("invert first", invert(pixels[0][0]))
print("source still", pixels[0][0])
`, J(`int[][][] pixels = {{{255, 0, 0}, {0, 255, 0}}, {{0, 0, 255}, {255, 255, 0}}};
int tone = (pixels[0][0][0] + pixels[0][0][1] + pixels[0][0][2]) / 3;
System.out.println("gray " + tone + " " + tone + " " + tone);
System.out.println("invert " + (255 - pixels[0][0][0]) + " " + (255 - pixels[0][0][1]) + " " + (255 - pixels[0][0][2]));
System.out.println("source " + pixels[0][0][0]);`), C(`int pixels[2][2][3] = {{{255, 0, 0}, {0, 255, 0}}, {{0, 0, 255}, {255, 255, 0}}};
int tone = (pixels[0][0][0] + pixels[0][0][1] + pixels[0][0][2]) / 3;
printf("gray %d %d %d\\n", tone, tone, tone);
printf("invert %d %d %d\\n", 255 - pixels[0][0][0], 255 - pixels[0][0][1], 255 - pixels[0][0][2]);
printf("source %d\\n", pixels[0][0][0]);`, "", ["stdio.h"]));

add(9, U9, "rotate-image", "Rotate Image", {
  say: "A 90 degree clockwise turn sends row r, column c to row c, column width - 1 - r. Draw the corners before writing the loop.",
  goal: "Rotate a 2 by 3 grid clockwise and print both grids.",
  steps: [
    "Label the corners A B C on the bottom row. After a clockwise turn, A should be the top-left of the new image.",
    "The new grid has swapped size: 3 rows and 2 columns. Using the old size is the usual crash.",
    "Check one formula on paper, then let the loop do the rest.",
  ],
  watch: "They swap indexes but forget width - 1 - r, so it is a transpose, not a rotation. Also writing into the same array.",
  done: "The printed corners match the paper turn, and they can say the new width is the old height.",
}, `source = [["A", "B"], ["C", "D"], ["E", "F"]]
rows, cols = len(source), len(source[0])
turned = [[""] * rows for _ in range(cols)]
for r in range(rows):
    for c in range(cols):
        turned[c][rows - 1 - r] = source[r][c]
for row in source:
    print(*row)
print("---")
for row in turned:
    print(*row)
`, J(`String[][] source = {{"A", "B"}, {"C", "D"}, {"E", "F"}};
int rows = 3, cols = 2;
String[][] turned = new String[cols][rows];
for (int r = 0; r < rows; r++) {
    for (int c = 0; c < cols; c++) turned[c][rows - 1 - r] = source[r][c];
}
for (String[] row : source) System.out.println(String.join(" ", row));
System.out.println("---");
for (String[] row : turned) System.out.println(String.join(" ", row));`), C(`char source[3][2] = {{'A', 'B'}, {'C', 'D'}, {'E', 'F'}};
char turned[2][3];
int r, c, rows = 3, cols = 2;
for (r = 0; r < rows; r++)
    for (c = 0; c < cols; c++) turned[c][rows - 1 - r] = source[r][c];
for (r = 0; r < rows; r++) printf("%c %c\\n", source[r][0], source[r][1]);
printf("---\\n");
for (r = 0; r < cols; r++) printf("%c %c %c\\n", turned[r][0], turned[r][1], turned[r][2]);`, "", ["stdio.h"]));

add(9, U9, "convolution", "Convolution", {
  say: "A convolution slides a small kernel over a grid. Each output cell is the weighted sum of the neighborhood. A blur kernel uses neighbors. An edge kernel cancels the flat areas.",
  goal: "Apply a 3 by 3 blur to the center of a 3 by 3 number image and print the new center.",
  steps: [
    "Write the kernel on a sticky note. All ones, then divide by 9, is a blur.",
    "Cover the center cell with the kernel and add the nine products by hand before the code.",
    "Skip the border today, or agree that cells outside the image are 0. Say which rule you chose.",
  ],
  watch: "They forget to divide, so the image gets brighter instead of smoother. Also using the already-updated neighbor in the same pass.",
  done: "The printed center matches the paper sum, and the source grid is still the old numbers.",
}, `image = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
kernel = [[1, 1, 1], [1, 1, 1], [1, 1, 1]]
total = 0
for kr in range(3):
    for kc in range(3):
        total += image[kr][kc] * kernel[kr][kc]
print("center", total // 9)
print("source still", image[1][1])
`, J(`int[][] image = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
int total = 0;
for (int r = 0; r < 3; r++)
    for (int c = 0; c < 3; c++) total += image[r][c];
System.out.println("center " + (total / 9));
System.out.println("source still " + image[1][1]);`), C(`int image[3][3] = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
int r, c, total = 0;
for (r = 0; r < 3; r++)
    for (c = 0; c < 3; c++) total += image[r][c];
printf("center %d\\n", total / 9);
printf("source still %d\\n", image[1][1]);`, "", ["stdio.h"]));

add(10, U10, "threading-101-python", "Threading 101 (Python)", {
  say: "A thread is another worker with the same job shape. Start does not mean finished. Join waits. The browser may not run real threads; this sample is the lab reference, and a one-thread simulation is included so Play still shows the lesson.",
  goal: "Run two counters and print both done only after both workers finish.",
  steps: [
    "First call the function twice in one thread so the order is obvious.",
    "Then start two threads and join both. Ask why both done must be after the joins.",
    "If Play cannot start a real thread, use the simulation below it and say the lab computer will run the real one.",
  ],
  watch: "They print both done before join, so the sentence is a lie. Also sharing one counter without agreeing who updates it.",
  done: "They can point at start, join, and the line that is allowed to say both workers are finished.",
}, `def count(name):
    for i in range(3):
        print(name, i)

print("simulated turns")
for i in range(3):
    print("A", i)
    print("B", i)
print("both done")
`, J(`for (int i = 0; i < 3; i++) {
    System.out.println("A " + i);
    System.out.println("B " + i);
}
System.out.println("both done");
System.out.println("lab reference: the browser has no real threads");`), C(`int i;
for (i = 0; i < 3; i++) {
    printf("A %d\\n", i);
    printf("B %d\\n", i);
}
printf("both done\\n");
printf("lab reference: the browser has no pthreads\\n");`, "", ["stdio.h"]), "python");

add(10, U10, "threading-101-java", "Threading 101 (Java)", {
  say: "Java's Thread starts work and join waits for it. This sample is a lab reference. The browser runner has no real threads, so the runnable part is a turn-taking simulation of the same lesson.",
  goal: "Show two workers taking turns, then explain where start and join would go on a lab computer.",
  steps: [
    "On the board, write Thread a, Thread b, start, start, join, join, both done.",
    "In the IDE, run the simulation. The labels A and B alternate because one loop does both turns.",
    "On a lab JDK, replace the loop with two Thread objects. Do not expect Play to do that here.",
  ],
  watch: "They think printing A then B is the same as two threads. Make them say what join is waiting for, even in the simulation.",
  done: "They can narrate start, start, join, join, and the printed simulation matches the turn order they predicted.",
}, `print("lab simulation, one worker taking turns")
for i in range(3):
    print("A", i)
    print("B", i)
print("both done")
`, J(`System.out.println("lab simulation, one worker taking turns");
for (int i = 0; i < 3; i++) {
    System.out.println("A " + i);
    System.out.println("B " + i);
}
System.out.println("both done");`), C(`int i;
printf("lab simulation, one worker taking turns\\n");
for (i = 0; i < 3; i++) {
    printf("A %d\\n", i);
    printf("B %d\\n", i);
}
printf("both done\\n");`, "", ["stdio.h"]), "java");

add(11, U11, "sockets-101-java", "Sockets 101 (Java)", {
  say: "A socket is one end of a conversation between programs. Java listens with a ServerSocket and answers with a Socket. This is a lab reference: the browser cannot open a real socket. Play the message sketch, not a live port.",
  goal: "Print the lines a server would send back, and be able to point at accept, read, and write in the lab sample.",
  steps: [
    "Act out the client and the server with two people. The server speaks second.",
    "Run the sketch. It prints the request and the echo without opening a port.",
    "On a lab JDK, the same words go through ServerSocket. Do not press Play on a real bind in this IDE.",
  ],
  watch: "They bind a port in the browser and decide the IDE is broken. Also they forget the server must accept before it can read.",
  done: "The sketch prints the echo line, and they can order bind, listen, accept, read, write without looking.",
}, `request = "ping"
print("client sent", request)
print("server would accept, then send: echo " + request)
`, J(`String request = "ping";
System.out.println("client sent " + request);
System.out.println("server would accept, then send: echo " + request);
System.out.println("lab reference: the browser cannot open a real socket");`), C(`char request[] = "ping";
printf("client sent %s\\n", request);
printf("server would accept, then send: echo %s\\n", request);
printf("lab reference: the browser cannot open a real socket\\n");`, "", ["stdio.h"]), "java");

add(11, U11, "sockets-101-python", "Sockets 101 (Python)", {
  say: "Python's socket module can listen and accept. In this IDE that call cannot open a real port. The sketch shows the bytes. The real bind belongs on a lab computer. Nothing here is committed to GitHub by itself.",
  goal: "Show a client message and the server echo, and name the socket calls that would carry them in the lab.",
  steps: [
    "Write the four lab calls on the board: socket, bind, listen, accept.",
    "Run the sketch. The echo must contain the client's word.",
    "Ask what would happen if accept came before bind. The server would have no door.",
  ],
  watch: "They paste a live server into Play and wait forever. Stop them. The sketch is the in-IDE version.",
  done: "They can match each printed line to a socket call, and they know Play is not the lab.",
}, `request = input("Client message: ")
print("bind, listen, accept")
print("echo " + request)
`, J(`String request = "hello";
System.out.println("bind, listen, accept");
System.out.println("echo " + request);`), C(`char request[] = "hello";
printf("bind, listen, accept\\n");
printf("echo %s\\n", request);`, "", ["stdio.h"]), "python");

add(11, U11, "socket-101-c", "Socket 101 (C)", {
  say: "C sockets are file descriptors plus a handful of calls: socket, bind, listen, accept, read, write, close. The browser cannot do those calls. This sample prints the conversation the calls would carry. Use a lab compiler for the real header.",
  goal: "Print a one-line echo and list the C calls in order.",
  steps: [
    "Write the call list before the printf. Leave a blank where accept sits.",
    "Run the sketch. Then fill the blank and read the list aloud.",
    "On the lab machine, those names are real functions. Here they are the lesson, not a running server.",
  ],
  watch: "They include a live socket() call and Play fails. Also they close the listening socket before accept.",
  done: "The echo prints, and the call list is in the order a lab server would use.",
}, `print("socket, bind, listen, accept, read, write, close")
print("echo ping")
`, J(`System.out.println("socket, bind, listen, accept, read, write, close");
System.out.println("echo ping");`), C(`printf("socket, bind, listen, accept, read, write, close\\n");
printf("echo ping\\n");`, "", ["stdio.h"]), "c");

add(11, U11, "socket-types", "Socket Types", {
  say: "TCP is a phone call: connected, ordered, and reliable. UDP is a postcard: addressed, but it can be lost or arrive out of order. The type is chosen when the socket is created.",
  goal: "Print one TCP conversation and one UDP message, and say which one needed a connection.",
  steps: [
    "Send two numbered TCP lines and show they stay in order.",
    "Send two UDP postcards and say the program must not assume the second arrived.",
    "Ask which type a file download wants, and which type a quick position update might use.",
  ],
  watch: "They think UDP is just TCP without a port. The difference is the promise, not the address.",
  done: "They can point at the connected stream and the standalone datagram, and pick TCP for the download.",
}, `print("TCP connected")
for part in (1, 2):
    print("tcp", part)
print("UDP postcard 1, may arrive alone")
print("UDP postcard 2, may be missing")
`, J(`System.out.println("TCP connected");
for (int part = 1; part <= 2; part++) System.out.println("tcp " + part);
System.out.println("UDP postcard 1, may arrive alone");
System.out.println("UDP postcard 2, may be missing");`), C(`int part;
printf("TCP connected\\n");
for (part = 1; part <= 2; part++) printf("tcp %d\\n", part);
printf("UDP postcard 1, may arrive alone\\n");
printf("UDP postcard 2, may be missing\\n");`, "", ["stdio.h"]));

add(11, U11, "socket-messaging", "Socket Messaging App (P2P)", {
  say: "A peer is both client and server. Each side has an inbox and an outbox. A message needs a sender name, or the other peer cannot tell who spoke. Real sockets are a lab reference; the browser prints the exchange.",
  goal: "Exchange two named messages and print them in inbox order.",
  steps: [
    "Give the two peers names before any message. Ada sends first in this sample.",
    "Each message is name plus text. Print the inbox after both sends.",
    "Ask what breaks if the name is missing. The inbox becomes an unlabeled pile.",
  ],
  watch: "They print only the text. Also they assume the peer is listening before anyone bound a port, which is the lab version of the same bug.",
  done: "Both lines show a sender, and they can say which peer would accept and which would connect in the lab.",
}, `inbox = []
inbox.append("Ada: ready")
inbox.append("Lin: ready too")
for message in inbox:
    print(message)
`, J(`String[] inbox = {"Ada: ready", "Lin: ready too"};
for (String message : inbox) System.out.println(message);`), C(`printf("Ada: ready\\n");
printf("Lin: ready too\\n");`, "", ["stdio.h"]));

add(11, U11, "networking-rps", "Networking Rock Paper Scissors", {
  say: "The game is the same as before, but each player is a peer. Neither side may print the winner until both moves have arrived. The browser shows the rule. A real match would send the moves on sockets in the lab.",
  goal: "Take two moves and print the winner only after both are known.",
  steps: [
    "Store Ada's move. Do not judge yet. That pause is the network.",
    "Store Lin's move, then use the same rules as the earlier rock-paper-scissors module.",
    "Ask what you would send on the wire: the word, not the winner. The winner is computed after both words exist.",
  ],
  watch: "They decide the winner from one move. Also they send the winner across and skip the other player's choice.",
  done: "A tie and a win both wait for two moves, and they can name the message each peer would send.",
}, `ada = input("Ada: ")
lin = input("Lin: ")
beats = {"rock": "scissors", "paper": "rock", "scissors": "paper"}
if ada == lin:
    print("tie")
elif beats.get(ada) == lin:
    print("Ada wins")
elif beats.get(lin) == ada:
    print("Lin wins")
else:
    print("use rock, paper, or scissors")
`, J(`String ada = "rock", lin = "scissors";
if (ada.equals(lin)) System.out.println("tie");
else if (ada.equals("rock") && lin.equals("scissors")) System.out.println("Ada wins");
else if (ada.equals("paper") && lin.equals("rock")) System.out.println("Ada wins");
else if (ada.equals("scissors") && lin.equals("paper")) System.out.println("Ada wins");
else System.out.println("Lin wins");`), C(`char ada[] = "rock", lin[] = "scissors";
if (strcmp(ada, lin) == 0) printf("tie\\n");
else if (strcmp(ada, "rock") == 0 && strcmp(lin, "scissors") == 0) printf("Ada wins\\n");
else printf("Lin wins\\n");`, "", ["stdio.h", "string.h"]));

add(11, U11, "http-101", "HTTP 101", {
  say: "HTTP is text on a socket. A request has a start line, headers, a blank line, and maybe a body. A response has a status code before any HTML. You can learn the shape without a server.",
  goal: "Print a GET request and a 200 response, including the blank line that ends the headers.",
  steps: [
    "Write the request on the board first. GET, Host, blank line.",
    "Have them point at the blank line. Without it, the other side is still waiting for headers.",
    "Change 200 to 404 and ask what the browser would think. The body can still be text.",
  ],
  watch: "They put the HTML before the status line, or they never send the blank line.",
  done: "The request and response both have a blank line after the headers, and the status is the first response line.",
}, `print("GET /hello HTTP/1.1")
print("Host: teachforth.local")
print("")
print("HTTP/1.1 200 OK")
print("Content-Type: text/plain")
print("")
print("Hello")
`, J(`System.out.println("GET /hello HTTP/1.1");
System.out.println("Host: teachforth.local");
System.out.println();
System.out.println("HTTP/1.1 200 OK");
System.out.println("Content-Type: text/plain");
System.out.println();
System.out.println("Hello");`), C(`printf("GET /hello HTTP/1.1\\n");
printf("Host: teachforth.local\\n");
printf("\\n");
printf("HTTP/1.1 200 OK\\n");
printf("Content-Type: text/plain\\n");
printf("\\n");
printf("Hello\\n");`, "", ["stdio.h"]));

add(11, U11, "apis", "APIs", {
  say: "An API is a promise about requests and responses. You send a path and maybe a query. You get a status and a body, often JSON. Read the fields you were promised. Ignore the rest until you need them.",
  goal: "Build a request for a student name and pull one field out of a JSON body.",
  steps: [
    "Write the request path with the name in the query, not hidden in a variable name only.",
    "Give them a small JSON body on the board. Have them find the field with a finger before the code.",
    "If the status is not 200, do not pretend the body has the field.",
  ],
  watch: "They print the whole body and say they parsed it. Also they crash when the field is missing instead of saying so.",
  done: "A 200 prints the field, a missing field prints a clear miss, and they can show the request that asked for it.",
}, `import json
status = 200
body = json.dumps({"student": "Ada", "course": "python"})
print("GET /api/student?name=Ada")
if status != 200:
    print("no body")
else:
    data = json.loads(body)
    print(data.get("student", "missing field"))
`, J(`String body = "{\\"student\\":\\"Ada\\",\\"course\\":\\"python\\"}";
System.out.println("GET /api/student?name=Ada");
int at = body.indexOf("\\"student\\":\\"");
if (at < 0) System.out.println("missing field");
else {
    int start = at + 11;
    int end = body.indexOf('"', start);
    System.out.println(body.substring(start, end));
}`), C(`const char *body = "{\\"student\\":\\"Ada\\",\\"course\\":\\"python\\"}";
const char *key = "\\"student\\":\\"";
const char *at = strstr(body, key);
printf("GET /api/student?name=Ada\\n");
if (!at) printf("missing field\\n");
else {
    at += 11;
    while (*at && *at != '"') putchar(*at++);
    putchar('\\n');
}`, "", ["stdio.h", "string.h"]));

export { MODULES };
