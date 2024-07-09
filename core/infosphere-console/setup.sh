#!/bin/bash
echo "========== Running setup script =========="

echo "Installing Shadcn Vue component"
yes | npx shadcn-vue@latest add button
yes | npx shadcn-vue@latest add label
yes | npx shadcn-vue@latest add input
yes | npx shadcn-vue@latest add form
yes | npx shadcn-vue@latest add toast
yes | npx shadcn-vue@latest add alert

echo "========== Done setup script =========="
