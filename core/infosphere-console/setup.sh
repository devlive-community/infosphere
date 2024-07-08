#!/bin/bash
echo "========== Running setup script =========="

echo "Installing Shadcn Vue component"
yes | npx shadcn-vue@latest add button
yes | npx shadcn-vue@latest add label
yes | npx shadcn-vue@latest add input

echo "========== Done setup script =========="
