#!/bin/bash
echo "========== Running setup script =========="

echo "Installing Shadcn Vue component"
yes | npx shadcn-vue@latest add button
yes | npx shadcn-vue@latest add label
yes | npx shadcn-vue@latest add input
yes | npx shadcn-vue@latest add form
yes | npx shadcn-vue@latest add toast
yes | npx shadcn-vue@latest add alert
yes | npx shadcn-vue@latest add dropdown-menu
yes | npx shadcn-vue@latest add separator
yes | npx shadcn-vue@latest add textarea
yes | npx shadcn-vue@latest add switch
yes | npx shadcn-vue@latest add radio-group
yes | npx shadcn-vue@latest add card
yes | npx shadcn-vue@latest add pagination
yes | npx shadcn-vue@latest add skeleton
yes | npx shadcn-vue@latest add aspect-ratio
yes | npx shadcn-vue@latest add tooltip
yes | npx shadcn-vue@latest add tabs
yes | npx shadcn-vue@latest add dialog
yes | npx shadcn-vue@latest add alert-dialog
yes | npx shadcn-vue@latest add menubar
yes | npx shadcn-vue@latest add resizable
yes | npx shadcn-vue@latest add scroll-area

echo "========== Done setup script =========="
